import {sha256Hex} from './implementation-hash.ts';

export interface TestAppSubject {
  runId:string;
  attemptId:string;
  leaseId:string;
  fence:number;
  origin:string;
  accessIdentityId:string;
  principalSha256:string;
}

function validOrigin(value:string):boolean {
  try {
    const url=new URL(value);
    return url.protocol==='https:' && !url.username && !url.password && !url.port &&
      url.pathname==='/' && !url.search && !url.hash &&
      /^[a-z0-9-]+\.apps\.deos-test\.voxdez\.com$/.test(url.hostname) &&
      value===url.origin;
  } catch {return false;}
}

function secret():string {
  const bytes=new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_')
    .replace(/=+$/,'');
}

function valid(input:TestAppSubject):boolean {
  return Boolean(input.runId && input.attemptId && /^[a-f0-9]{64}$/.test(input.leaseId) &&
    Number.isSafeInteger(input.fence) && input.fence>0 && validOrigin(input.origin) &&
    input.accessIdentityId && /^[a-f0-9]{64}$/.test(input.principalSha256));
}

/** The coordinator issues the code to one trusted browser identity. */
export class SharedTestAppSessionStore {
  readonly db:D1Database;
  constructor(db:D1Database) {this.db=db;}

  async issue(input:TestAppSubject,at=new Date()):Promise<{code:string;expiresAt:string}> {
    if (!valid(input)) throw new Error('test_app_launch_subject_invalid');
    const code=secret(),digest=await sha256Hex(code),now=at.toISOString();
    const expiresAt=new Date(at.getTime()+5*60_000).toISOString();
    const result=await this.db.prepare(`INSERT INTO test_app_launch_codes
      (code_sha256,run_id,attempt_id,lease_id,fence,origin,access_identity_id,
       principal_sha256,expires_at,created_at)
      SELECT ?,?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM test_environment e
        JOIN test_leases l ON l.lease_id=e.owner_lease_id
        JOIN test_access_identities i ON i.lease_id=l.lease_id
        WHERE e.site_id=1 AND e.state='active' AND e.owner_run_id=?
          AND e.owner_lease_id=? AND e.fence=? AND e.heartbeat_due_at>?
          AND l.run_id=? AND l.attempt_id=? AND l.state='active' AND l.fence=?
          AND i.identity_id=? AND i.run_id=? AND i.origin=?
          AND i.principal_sha256=? AND i.revoked_at IS NULL AND i.absent_at IS NULL)`)
      .bind(digest,input.runId,input.attemptId,input.leaseId,input.fence,input.origin,
        input.accessIdentityId,input.principalSha256,expiresAt,now,
        input.runId,input.leaseId,input.fence,now,input.runId,input.attemptId,
        input.fence,input.accessIdentityId,input.runId,input.origin,
        input.principalSha256).run();
    if (result.meta.changes!==1) throw new Error('test_app_launch_fenced');
    return {code,expiresAt};
  }

  async redeem(input:TestAppSubject,code:string,at=new Date()):Promise<{cookie:string;
    expiresAt:string}> {
    if (!valid(input) || !/^[A-Za-z0-9_-]{43}$/.test(code))
      throw new Error('test_app_redeem_subject_invalid');
    const digest=await sha256Hex(code),session=secret(),sessionSha=await sha256Hex(session);
    const now=at.toISOString(),expiresAt=new Date(at.getTime()+15*60_000).toISOString();
    const results=await this.db.batch([
      this.db.prepare(`UPDATE test_app_launch_codes SET used_at=?,session_sha256=?
        WHERE code_sha256=? AND run_id=? AND attempt_id=? AND lease_id=? AND fence=?
          AND origin=? AND access_identity_id=? AND principal_sha256=?
          AND expires_at>? AND used_at IS NULL AND session_sha256 IS NULL
          AND EXISTS (SELECT 1 FROM test_environment e JOIN test_leases l
            ON l.lease_id=e.owner_lease_id WHERE e.site_id=1 AND e.state='active'
            AND e.owner_run_id=? AND e.owner_lease_id=? AND e.fence=?
            AND e.heartbeat_due_at>? AND l.state='active' AND l.fence=?)
          AND EXISTS (SELECT 1 FROM test_access_identities i
            WHERE i.identity_id=? AND i.lease_id=? AND i.origin=?
              AND i.principal_sha256=? AND i.revoked_at IS NULL AND i.absent_at IS NULL)`)
        .bind(now,sessionSha,digest,input.runId,input.attemptId,input.leaseId,
          input.fence,input.origin,input.accessIdentityId,input.principalSha256,
          now,input.runId,input.leaseId,input.fence,now,input.fence,
          input.accessIdentityId,input.leaseId,input.origin,input.principalSha256),
      this.db.prepare(`INSERT INTO test_app_sessions
        (session_sha256,run_id,attempt_id,lease_id,fence,origin,cookie_class,
         access_identity_id,principal_sha256,expires_at)
        SELECT ?,run_id,attempt_id,lease_id,fence,origin,'browser',
          access_identity_id,principal_sha256,? FROM test_app_launch_codes
        WHERE code_sha256=? AND session_sha256=? AND used_at=?`)
        .bind(sessionSha,expiresAt,digest,sessionSha,now),
      this.db.prepare(`INSERT INTO test_app_launch_guards
        (code_sha256,session_sha256,ready,redeemed_at)
        VALUES (?,?,CASE WHEN EXISTS (SELECT 1 FROM test_app_sessions s
          JOIN test_app_launch_codes c ON c.session_sha256=s.session_sha256
          WHERE c.code_sha256=? AND c.used_at=? AND s.session_sha256=?
            AND s.lease_id=? AND s.fence=? AND s.expires_at=?)
          THEN 1 ELSE 0 END,?)`)
        .bind(digest,sessionSha,digest,now,sessionSha,input.leaseId,input.fence,
          expiresAt,now),
    ]);
    if (results.some(result=>result.meta.changes!==1))
      throw new Error('test_app_redeem_write_incomplete');
    return {cookie:`__Host-deos_test=${session}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=900`,
      expiresAt};
  }

  async authorize(input:{session:string;origin:string;principalSha256:string},
    at=new Date()):Promise<boolean> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(input.session) ||
        !validOrigin(input.origin) ||
        !/^[a-f0-9]{64}$/.test(input.principalSha256)) return false;
    const digest=await sha256Hex(input.session),now=at.toISOString();
    const row=await this.db.prepare(`SELECT 1 AS allowed FROM test_app_sessions s
      JOIN test_environment e ON e.owner_lease_id=s.lease_id
        AND e.owner_run_id=s.run_id
      JOIN test_leases l ON l.lease_id=s.lease_id
      JOIN test_access_identities i ON i.identity_id=s.access_identity_id
      WHERE s.session_sha256=? AND s.origin=? AND s.principal_sha256=?
        AND s.cookie_class='browser' AND s.expires_at>? AND s.revoked_at IS NULL
        AND e.site_id=1 AND e.state='active' AND e.fence=s.fence
        AND e.heartbeat_due_at>? AND l.state='active' AND l.fence=s.fence
        AND l.attempt_id=s.attempt_id AND i.lease_id=s.lease_id
        AND i.origin=s.origin AND i.principal_sha256=s.principal_sha256
        AND i.revoked_at IS NULL AND i.absent_at IS NULL`)
      .bind(digest,input.origin,input.principalSha256,now,now)
      .first<{allowed:number}>();
    return row?.allowed===1;
  }
}
