import {sha256Hex} from './implementation-hash.ts';
import type {LinearCapabilityAdapter,LinearTestIssue} from './linear-capability.ts';
import {SharedTestLeaseStore} from './shared-test-lease.ts';
import {insertTestMarker,markerIsStandalone,removeTestMarker,testIssueMarker,
  testMarkerHashes,type TestMarkerSubject} from './shared-test-marker.ts';

interface ExpectedEventRow {
  expectation_id:string;
  run_id:string;
  lease_id:string;
  fence:number;
  task_id:string;
  team_id:string;
  actor_id:string;
  key_version:number;
  before_sha256:string;
  after_sha256:string;
  marker_sha256:string;
  state:string;
}

export class SharedTestMarkerStore {
  readonly db:D1Database;
  readonly linear:Pick<LinearCapabilityAdapter,'readTestIssue'|'updateTestIssueDescription'|'testActorId'>;
  readonly key:string;
  constructor(db:D1Database,
    linear:Pick<LinearCapabilityAdapter,'readTestIssue'|'updateTestIssueDescription'|'testActorId'>,
    key:string) {this.db=db;this.linear=linear;this.key=key;}

  private async issue(taskId:string,teamId:string):Promise<LinearTestIssue> {
    const issue=await this.linear.readTestIssue(taskId);
    if (issue.id!==taskId || issue.teamId!==teamId)
      throw new Error('test_issue_team_changed');
    return issue;
  }

  async insert(input:TestMarkerSubject & {attemptId:string;teamId:string},at=new Date()) {
    await new SharedTestLeaseStore(this.db).assertWrite(input.runId,input.attemptId,
      input.leaseId,input.fence);
    const issue=await this.issue(input.taskId,input.teamId);
    const actorId=await this.linear.testActorId();
    const marker=await testIssueMarker(input,this.key);
    const before=issue.description;
    const prior=await this.db.prepare('SELECT * FROM test_expected_events WHERE expectation_id=?')
      .bind(input.expectationId).first<ExpectedEventRow>();
    if (prior) {
      if (prior.run_id!==input.runId || prior.lease_id!==input.leaseId ||
          prior.fence!==input.fence || prior.task_id!==input.taskId ||
          prior.team_id!==input.teamId || prior.actor_id!==actorId ||
          prior.marker_sha256!==await sha256Hex(marker) ||
          !['live','claimed'].includes(prior.state))
        throw new Error('test_marker_plan_conflict');
      if (markerIsStandalone(before,marker)) {
        await this.db.prepare(`UPDATE test_operations SET state='done',receipt_json=?,ended_at=?
          WHERE work_id=? AND run_id=? AND lease_id=? AND state IN ('planned','running','uncertain')`)
          .bind(JSON.stringify({descriptionSha256:await sha256Hex(before),issueId:input.taskId,
            reconciled:true}),at.toISOString(),`test-marker:${input.expectationId}:insert`,
            input.runId,input.leaseId).run();
        return {marker,workId:`test-marker:${input.expectationId}:insert`,reconciled:true};
      }
      if (await sha256Hex(before)!==prior.before_sha256)
        throw new Error('test_marker_before_changed');
    }
    const after=insertTestMarker(before,marker);
    const hashes=await testMarkerHashes(before,after,marker);
    const workId=`test-marker:${input.expectationId}:insert`;
    const now=at.toISOString();
    const results=await this.db.batch([
      this.db.prepare(`INSERT OR IGNORE INTO test_expected_events
        (expectation_id,run_id,lease_id,fence,task_id,team_id,kind,action,actor_id,
         key_version,challenge_sha256,before_sha256,after_sha256,marker_sha256,
         valid_from_ms,valid_until_ms,state,created_at)
        SELECT ?,?,?,?,? ,?,'Issue','update',?,1,?,?,?,?,?,?,'live',?
        WHERE EXISTS (SELECT 1 FROM test_environment e JOIN test_leases l
          ON l.lease_id=e.owner_lease_id WHERE e.site_id=1 AND e.state='active'
            AND e.owner_run_id=? AND e.owner_lease_id=? AND e.fence=?
            AND l.attempt_id=? AND l.task_id=? AND l.team_id=?)`)
        .bind(input.expectationId,input.runId,input.leaseId,input.fence,input.taskId,
          input.teamId,actorId,await sha256Hex(JSON.stringify(input)),
          hashes.beforeSha256,hashes.afterSha256,hashes.markerSha256,
          at.getTime()-30_000,at.getTime()+300_000,now,input.runId,
          input.leaseId,input.fence,input.attemptId,input.taskId,input.teamId),
      this.db.prepare(`INSERT OR IGNORE INTO test_operations
        (work_id,run_id,lease_id,fence,kind,target,expected_description_sha256,
         state,started_at)
        SELECT ?,?,?,?,'linear_marker_insert',?,?,'planned',?
        WHERE EXISTS (SELECT 1 FROM test_expected_events WHERE expectation_id=?
          AND run_id=? AND lease_id=? AND state='live')`)
        .bind(workId,input.runId,input.leaseId,input.fence,input.taskId,
          hashes.afterSha256,now,input.expectationId,input.runId,input.leaseId),
    ]);
    const saved=await this.db.prepare('SELECT * FROM test_expected_events WHERE expectation_id=?')
      .bind(input.expectationId).first<ExpectedEventRow>();
    if (!saved || saved.run_id!==input.runId || saved.lease_id!==input.leaseId ||
        saved.fence!==input.fence || saved.task_id!==input.taskId ||
        saved.team_id!==input.teamId || saved.actor_id!==actorId ||
        saved.before_sha256!==hashes.beforeSha256 ||
        saved.after_sha256!==hashes.afterSha256 ||
        saved.marker_sha256!==hashes.markerSha256 || !['live','claimed'].includes(saved.state))
      throw new Error('test_marker_plan_conflict');
    if (await sha256Hex(before)!==saved.before_sha256)
      throw new Error('test_marker_before_changed');
    await this.db.prepare(`UPDATE test_operations SET state='running'
      WHERE work_id=? AND state='planned'`).bind(workId).run();
    const result=await this.linear.updateTestIssueDescription(input.taskId,after);
    if (result.teamId!==input.teamId || result.description!==after)
      throw new Error('test_marker_linear_readback_changed');
    await this.db.prepare(`UPDATE test_operations SET state='done',receipt_json=?,ended_at=?
      WHERE work_id=? AND run_id=? AND lease_id=? AND state IN ('planned','running')`)
      .bind(JSON.stringify({descriptionSha256:hashes.afterSha256,issueId:input.taskId}),
        new Date().toISOString(),workId,input.runId,input.leaseId).run();
    return {marker,workId,reconciled:false};
  }

  async disableAndRemove(input:TestMarkerSubject & {teamId:string;cleanupFence:number},at=new Date()) {
    const allowed=await this.db.prepare(`SELECT 1 AS allowed FROM test_environment e
      JOIN test_leases l ON l.lease_id=e.owner_lease_id
      JOIN test_lease_fence_epochs old ON old.lease_id=l.lease_id AND old.fence=?
      JOIN test_lease_fence_epochs current ON current.lease_id=l.lease_id AND current.fence=e.fence
      WHERE e.site_id=1 AND e.state IN ('quiescing','cleaning') AND e.owner_run_id=?
        AND e.owner_lease_id=? AND e.fence=? AND l.task_id=? AND l.team_id=?`)
      .bind(input.fence,input.runId,input.leaseId,input.cleanupFence,input.taskId,
        input.teamId).first<{allowed:number}>();
    if (allowed?.allowed!==1) throw new Error('test_marker_cleanup_fenced');
    const disable=await this.db.prepare(`UPDATE test_expected_events SET state='disabled'
      WHERE expectation_id=? AND run_id=? AND lease_id=? AND fence=?
        AND task_id=? AND team_id=? AND state IN ('planned','live','claimed','disabled')`)
      .bind(input.expectationId,input.runId,input.leaseId,input.fence,input.taskId,
        input.teamId).run();
    if (disable.meta.changes!==1) throw new Error('test_marker_expectation_missing');
    const issue=await this.issue(input.taskId,input.teamId);
    const marker=await testIssueMarker(input,this.key);
    const workId=`test-marker:${input.expectationId}:remove`;
    if (!issue.description.includes(marker)) {
      await this.db.prepare(`INSERT OR IGNORE INTO test_operations
        (work_id,run_id,lease_id,fence,kind,target,expected_description_sha256,
         state,started_at) VALUES (?,?,?,?,'linear_marker_remove',?,?,'absent',?)`)
        .bind(workId,input.runId,input.leaseId,input.cleanupFence,input.taskId,
          await sha256Hex(issue.description),at.toISOString()).run();
      await this.db.prepare(`UPDATE test_operations SET state='absent',receipt_json=?,ended_at=?
        WHERE work_id=? AND run_id=? AND lease_id=? AND kind='linear_marker_remove'
          AND state IN ('planned','running','uncertain','absent')`)
        .bind(JSON.stringify({descriptionSha256:await sha256Hex(issue.description),markerAbsent:true,
          reconciled:true}),at.toISOString(),workId,input.runId,input.leaseId).run();
      return {workId,absent:true};
    }
    const after=removeTestMarker(issue.description,marker);
    const afterHash=await sha256Hex(after);
    await this.db.prepare(`INSERT OR IGNORE INTO test_operations
      (work_id,run_id,lease_id,fence,kind,target,expected_description_sha256,
       state,started_at) VALUES (?,?,?,?,'linear_marker_remove',?,?,'planned',?)`)
      .bind(workId,input.runId,input.leaseId,input.cleanupFence,input.taskId,
        afterHash,at.toISOString()).run();
    const operation=await this.db.prepare(`SELECT expected_description_sha256 FROM test_operations
      WHERE work_id=? AND run_id=? AND lease_id=?`)
      .bind(workId,input.runId,input.leaseId)
      .first<{expected_description_sha256:string}>();
    if (operation?.expected_description_sha256!==afterHash)
      throw new Error('test_marker_remove_human_edit_conflict');
    const result=await this.linear.updateTestIssueDescription(input.taskId,after);
    if (result.teamId!==input.teamId || result.description!==after)
      throw new Error('test_marker_remove_readback_changed');
    await this.db.prepare(`UPDATE test_operations SET state='done',receipt_json=?,ended_at=?
      WHERE work_id=? AND run_id=? AND lease_id=?`)
      .bind(JSON.stringify({descriptionSha256:afterHash,markerAbsent:true}),
        new Date().toISOString(),workId,input.runId,input.leaseId).run();
    return {workId,absent:true};
  }
}
