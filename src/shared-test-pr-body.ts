import {sha256Hex} from './implementation-hash.ts';

export interface PullRequestBodyClient {
  read(repository:string,pullRequestNumber:number):Promise<string>;
  write(repository:string,pullRequestNumber:number,body:string):Promise<void>;
}

interface BodyWrite {
  repository:string;
  pull_request_number:number;
  work_id:string;
  run_id:string;
  lease_id:string;
  marker:string;
  state:'planned'|'writing'|'verified'|'blocked';
  old_body_sha256:string|null;
  expected_body_sha256:string|null;
}

export function mergeProofSection(body:string,marker:string,section:string):string {
  if (!/^[a-zA-Z0-9._:-]{1,120}$/.test(marker)) throw new Error('invalid_pr_body_marker');
  const start=`<!-- ${marker}:start -->`,end=`<!-- ${marker}:end -->`;
  const first=body.indexOf(start),last=body.lastIndexOf(start);
  const endFirst=body.indexOf(end),endLast=body.lastIndexOf(end);
  if (first!==last || endFirst!==endLast || (first<0)!==(endFirst<0) ||
      (first>=0 && endFirst<first+start.length)) throw new Error('pr_body_marker_conflict');
  const replacement=`${start}\n${section.trim()}\n${end}`;
  return first<0 ? `${body}${body ? '\n\n' : ''}${replacement}\n` :
    body.slice(0,first)+replacement+body.slice(endFirst+end.length);
}

export class SharedTestPrBodyWriter {
  readonly db:D1Database;
  readonly client:PullRequestBodyClient;
  constructor(db:D1Database,client:PullRequestBodyClient) {this.db=db;this.client=client;}

  private async acquire(input:{repository:string;pullRequestNumber:number;workId:string;
    runId:string;leaseId:string;marker:string},at:Date):Promise<BodyWrite> {
    const {repository,pullRequestNumber,workId,runId,leaseId,marker}=input;
    if (!repository || !Number.isSafeInteger(pullRequestNumber) || pullRequestNumber<1 ||
        !workId || !runId || !leaseId || !/^[a-zA-Z0-9._:-]{1,120}$/.test(marker))
      throw new Error('invalid_pr_body_scope');
    const previous=await this.db.prepare('SELECT * FROM test_pr_body_writes WHERE work_id=?')
      .bind(workId).first<BodyWrite>();
    if (previous?.state==='verified') {
      if (previous.repository!==repository || previous.pull_request_number!==pullRequestNumber ||
          previous.run_id!==runId || previous.lease_id!==leaseId || previous.marker!==marker)
        throw new Error('pr_body_writer_scope_conflict');
      return previous;
    }
    await this.db.batch([
      this.db.prepare(`INSERT OR IGNORE INTO test_pr_body_locks
        (repository,pull_request_number,state) SELECT ?,?,'idle'
        WHERE EXISTS (SELECT 1 FROM test_leases WHERE lease_id=? AND run_id=?
          AND repository=? AND pull_request_number=?)`)
        .bind(repository,pullRequestNumber,leaseId,runId,repository,pullRequestNumber),
      this.db.prepare(`UPDATE test_pr_body_locks SET state='held',work_id=?,revision=revision+1
        WHERE repository=? AND pull_request_number=? AND
          (state='idle' OR (state='held' AND work_id=?))`)
        .bind(workId,repository,pullRequestNumber,workId),
      this.db.prepare(`INSERT OR IGNORE INTO test_pr_body_writes
        (repository,pull_request_number,work_id,run_id,lease_id,state,marker,started_at)
        SELECT ?,?,?,?,?,'planned',?,? WHERE EXISTS (SELECT 1 FROM test_pr_body_locks
          WHERE repository=? AND pull_request_number=? AND state='held' AND work_id=?)`)
        .bind(repository,pullRequestNumber,workId,runId,leaseId,marker,at.toISOString(),
          repository,pullRequestNumber,workId),
    ]);
    const row=await this.db.prepare('SELECT * FROM test_pr_body_writes WHERE work_id=?')
      .bind(workId).first<BodyWrite>();
    if (!row || row.repository!==repository || row.pull_request_number!==pullRequestNumber ||
        row.run_id!==runId || row.lease_id!==leaseId || row.marker!==marker)
      throw new Error('pr_body_writer_busy_or_scope_conflict');
    return row;
  }

  private async block(workId:string):Promise<void> {
    await this.db.prepare(`UPDATE test_pr_body_writes SET state='blocked'
      WHERE work_id=? AND state<>'verified'`).bind(workId).run();
  }

  async writeSection(input:{repository:string;pullRequestNumber:number;workId:string;
    runId:string;leaseId:string;marker:string;section:string},at=new Date()):Promise<string> {
    const row=await this.acquire(input,at);
    let current=await this.client.read(input.repository,input.pullRequestNumber);
    let currentHash=await sha256Hex(current);
    if (row.state==='verified') {
      if (currentHash!==row.expected_body_sha256) throw new Error('pr_body_verified_content_changed');
      return current;
    }
    if (row.state==='blocked') throw new Error('pr_body_write_blocked');
    if (row.state==='writing') {
      if (currentHash===row.expected_body_sha256) {
        await this.finish(input,at);
        return current;
      }
      if (currentHash!==row.old_body_sha256) {
        await this.block(input.workId);
        throw new Error('pr_body_uncertain_remote_change');
      }
    }
    const expected=mergeProofSection(current,input.marker,input.section);
    const expectedHash=await sha256Hex(expected);
    if (row.state==='planned') {
      const result=await this.db.prepare(`UPDATE test_pr_body_writes SET state='writing',
        old_body_sha256=?,expected_body_sha256=? WHERE work_id=? AND state='planned'`)
        .bind(currentHash,expectedHash,input.workId).run();
      if (result.meta.changes!==1) throw new Error('pr_body_write_plan_race');
    } else if (expectedHash!==row.expected_body_sha256) {
      await this.block(input.workId);
      throw new Error('pr_body_retry_content_changed');
    }
    const before=await this.client.read(input.repository,input.pullRequestNumber);
    if (await sha256Hex(before)!==currentHash) {
      await this.block(input.workId);
      throw new Error('pr_body_changed_before_write');
    }
    await this.client.write(input.repository,input.pullRequestNumber,expected);
    current=await this.client.read(input.repository,input.pullRequestNumber);
    currentHash=await sha256Hex(current);
    if (currentHash!==expectedHash) {
      await this.block(input.workId);
      throw new Error('pr_body_readback_mismatch');
    }
    await this.finish(input,at);
    return current;
  }

  private async finish(input:{repository:string;pullRequestNumber:number;workId:string},at:Date) {
    const results=await this.db.batch([
      this.db.prepare(`UPDATE test_pr_body_writes SET state='verified',verified_at=?
        WHERE work_id=? AND state='writing'`).bind(at.toISOString(),input.workId),
      this.db.prepare(`UPDATE test_pr_body_locks SET state='idle',work_id=NULL,
        revision=revision+1 WHERE repository=? AND pull_request_number=?
          AND state='held' AND work_id=?`)
        .bind(input.repository,input.pullRequestNumber,input.workId),
    ]);
    if (results[0].meta.changes!==1 || results[1].meta.changes!==1)
      throw new Error('pr_body_write_finish_incomplete');
  }
}
