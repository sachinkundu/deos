import {SharedTestBrowserCleanup} from './shared-test-browser-cleanup.ts';
import {CloudflareTestBrowserProvider} from './shared-test-browser-provider.ts';
import {SharedTestBrowserStore} from './shared-test-browser-store.ts';

interface RetrySubject {
  run_id:string;lease_id:string;attempt_id:string;request_id:string;fence:number;
  state:string;fault_id:string|null;browser_session_id:string|null;
}

async function retryAttemptId(leaseId:string,oldAttemptId:string):Promise<string> {
  const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',
    new TextEncoder().encode(`shared-test-cookie-retry-v1:${leaseId}:${oldAttemptId}`)));
  digest[6]=(digest[6]&15)|64;
  digest[8]=(digest[8]&63)|128;
  const value=[...digest.slice(0,16)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
  return `${value.slice(0,8)}-${value.slice(8,12)}-${value.slice(12,16)}-${value.slice(16,20)}-${value.slice(20)}`;
}

/** Rotate only the failed demo attempt, after proving its Sandbox and browser gone. */
export async function retryFailedSharedTestDemo(env:Pick<Env,'DB'|'IMPLEMENTATION_BROWSER'>,
  runId:string,leaseId:string,attemptId:string,fence:number,
  at=new Date(),closeBrowser:((leaseId:string,runId:string,at:Date)=>Promise<void>)=
    async(ownedLease,ownedRun,when)=>new SharedTestBrowserCleanup(
      new SharedTestBrowserStore(env.DB),
      new CloudflareTestBrowserProvider(env.IMPLEMENTATION_BROWSER))
      .resume(ownedLease,ownedRun,when)):Promise<boolean> {
  const prior=await env.DB.prepare(`SELECT 1 AS done FROM test_demo_attempt_retries
    WHERE lease_id=?`).bind(leaseId).first<{done:number}>();
  if(prior)return false;
  const subject=await env.DB.prepare(`SELECT l.run_id,l.lease_id,l.attempt_id,
    l.request_id,l.fence,l.state,
    (SELECT fault_id FROM test_failures f WHERE f.lease_id=l.lease_id
      AND f.safe_code='test_browser_action_failed'
      AND f.first_message='test_app_launch_cookie_invalid'
      ORDER BY f.occurred_at DESC LIMIT 1) AS fault_id,
    (SELECT session_id FROM test_browser_sessions b WHERE b.lease_id=l.lease_id
      AND b.service_name='bettaview') AS browser_session_id
    FROM test_leases l JOIN test_environment e ON e.owner_lease_id=l.lease_id
    WHERE l.lease_id=? AND e.site_id=1 AND e.state='active'
      AND e.owner_run_id=? AND e.fence=? AND e.heartbeat_due_at>?`)
    .bind(leaseId,runId,fence,at.toISOString()).first<RetrySubject>();
  if(!subject || subject.run_id!==runId || subject.attempt_id!==attemptId ||
      subject.state!=='active' || !subject.fault_id)
    return false;
  const terminal=await env.DB.prepare(`SELECT 1 AS ready FROM agent_attempts
    WHERE attempt_id=? AND run_id=? AND node_id='shared_test_demo'
      AND state='blocked' AND cleanup_state='destroyed' AND ended_at IS NOT NULL`)
    .bind(attemptId,runId).first<{ready:number}>();
  if(!terminal)return false;
  const effects=await env.DB.prepare(`SELECT
    (SELECT COUNT(*) FROM test_provider_deliveries WHERE lease_id=?) AS deliveries,
    (SELECT COUNT(*) FROM test_delivery_dispatch WHERE lease_id=?) AS dispatches,
    (SELECT COUNT(*) FROM test_proof_items WHERE lease_id=?
      AND NOT (phase='first' AND kind='showboat'
        AND body_marker IS NULL AND read_at IS NULL)) AS proof_items`)
    .bind(leaseId,leaseId,leaseId)
    .first<{deliveries:number;dispatches:number;proof_items:number}>();
  if(!effects || effects.deliveries || effects.dispatches || effects.proof_items)
    return false;
  await closeBrowser(leaseId,runId,at);
  const browser=await env.DB.prepare(`SELECT COUNT(*) AS count FROM test_browser_sessions
    WHERE lease_id=? AND state<>'absent'`).bind(leaseId)
    .first<{count:number}>();
  if(browser?.count!==0)throw new Error('test_demo_retry_browser_remains');
  const next=await retryAttemptId(leaseId,attemptId);
  const now=at.toISOString();
  const results=await env.DB.batch([
    env.DB.prepare(`INSERT INTO test_demo_attempt_retries
      (lease_id,run_id,old_attempt_id,new_attempt_id,fault_id,browser_session_id,committed_at)
      SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM test_environment e
        JOIN test_leases l ON l.lease_id=e.owner_lease_id
        WHERE e.site_id=1 AND e.state='active' AND e.owner_run_id=?
          AND e.owner_lease_id=? AND e.fence=? AND e.heartbeat_due_at>?
          AND l.attempt_id=? AND l.state='active')`)
      .bind(leaseId,runId,attemptId,next,subject.fault_id,
        subject.browser_session_id,now,runId,leaseId,fence,now,attemptId),
    env.DB.prepare(`UPDATE test_app_sessions SET revoked_at=? WHERE lease_id=?
      AND attempt_id=? AND revoked_at IS NULL`)
      .bind(now,leaseId,attemptId),
    env.DB.prepare(`UPDATE test_proof_items SET phase='superseded'
      WHERE lease_id=? AND phase='first' AND kind='showboat'
        AND body_marker IS NULL AND read_at IS NULL`)
      .bind(leaseId),
    env.DB.prepare(`UPDATE test_browser_sessions SET attempt_id=?,state='planned',
      inventory_json='[]',create_window=NULL,session_id=NULL,prepared_until=NULL,
      absent_at=NULL,updated_at=? WHERE lease_id=? AND attempt_id=?
        AND state='absent' AND EXISTS (SELECT 1 FROM test_demo_attempt_retries
          WHERE lease_id=? AND old_attempt_id=? AND new_attempt_id=?)`)
      .bind(next,now,leaseId,attemptId,leaseId,attemptId,next),
    env.DB.prepare(`UPDATE test_leases SET attempt_id=? WHERE lease_id=?
      AND run_id=? AND attempt_id=? AND state='active' AND fence=?`)
      .bind(next,leaseId,runId,attemptId,fence),
    env.DB.prepare(`UPDATE test_lease_requests SET attempt_id=?,updated_at=?
      WHERE request_id=? AND run_id=? AND attempt_id=? AND state='granted'`)
      .bind(next,now,subject.request_id,runId,attemptId),
    env.DB.prepare(`INSERT INTO test_demo_retry_guards(lease_id,ready)
      VALUES (?,CASE WHEN EXISTS (SELECT 1 FROM test_demo_attempt_retries
        WHERE lease_id=? AND old_attempt_id=? AND new_attempt_id=?)
        AND EXISTS (SELECT 1 FROM test_leases WHERE lease_id=? AND attempt_id=?)
        AND EXISTS (SELECT 1 FROM test_lease_requests WHERE request_id=?
          AND attempt_id=?)
        AND NOT EXISTS (SELECT 1 FROM test_app_sessions WHERE lease_id=?
          AND attempt_id=? AND revoked_at IS NULL)
        AND NOT EXISTS (SELECT 1 FROM test_browser_sessions WHERE lease_id=?
          AND attempt_id=?)
        AND NOT EXISTS (SELECT 1 FROM test_proof_items WHERE lease_id=?
          AND phase='first' AND kind='showboat') THEN 1 ELSE 0 END)`)
      .bind(leaseId,leaseId,attemptId,next,leaseId,next,
        subject.request_id,next,leaseId,attemptId,leaseId,attemptId,leaseId),
  ]);
  if(results[0].meta.changes!==1 || results[4].meta.changes!==1 ||
      results[5].meta.changes!==1 || results[6].meta.changes!==1)
    throw new Error('test_demo_retry_write_incomplete');
  return true;
}
