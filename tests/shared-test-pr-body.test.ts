import assert from 'node:assert/strict';
import test from 'node:test';
import {ImplementationTestDatabase} from './helpers/implementation-fixture.ts';
import {SharedTestPrBodyWriter,mergeProofSection} from '../src/shared-test-pr-body.ts';

function fixture() {
  const db=new ImplementationTestDatabase();
  db.sqlite.prepare(`INSERT INTO test_lease_requests
    (request_id,run_id,node_visit,attempt_id,task_id,candidate_commit,patch_sha256,
     state,created_at,updated_at) VALUES
    ('request-1','run-1',1,'attempt-1','task-1',?,?,'granted','now','now')`)
    .run('a'.repeat(40),'b'.repeat(64));
  db.sqlite.prepare(`INSERT INTO test_leases
    (lease_id,request_id,run_id,attempt_id,task_id,task_key,task_title,team_id,
     stage,state,fence,base_manifest_id,base_traffic_revision,base_json,repository,
     branch,pull_request_number,candidate_commit,patch_sha256,created_at)
    VALUES ('lease-1','request-1','run-1','attempt-1','task-1','SAC-1','Test','team-1',
      'shared_test_demo','active',1,'manifest-1','traffic-1','{}','owner/repo',
      'codex/test',150,?,?,'now')`).run('a'.repeat(40),'b'.repeat(64));
  const scope={repository:'owner/repo',pullRequestNumber:150,runId:'run-1',
    leaseId:'lease-1',workId:'work-1',marker:'deos-test-proof:lease-1',section:'Safe proof'};
  return {db,scope};
}

test('serialized body update preserves other text and reads back the exact section',async()=>{
  const {db,scope}=fixture();
  let body='Human review notes\n';
  try {
    const writer=new SharedTestPrBodyWriter(db as unknown as D1Database,
      {read:async()=>body,write:async(_repo,_pr,value)=>{body=value;}});
    const expected=mergeProofSection(body,scope.marker,scope.section);
    assert.equal(await writer.writeSection(scope),expected);
    assert.equal(await writer.writeSection(scope),expected);
    assert.match(body,/Human review notes/);
    assert.equal(db.sqlite.prepare("SELECT state FROM test_pr_body_writes WHERE work_id='work-1'").get()?.state,
      'verified');
    assert.equal(db.sqlite.prepare("SELECT state FROM test_pr_body_locks WHERE repository='owner\/repo'").get()?.state,
      'idle');
  } finally {db.close();}
});

test('a lost GitHub reply reconciles from the exact body and keeps one work ID',async()=>{
  const {db,scope}=fixture();
  let body='Review notes\n',loseReply=true;
  try {
    const writer=new SharedTestPrBodyWriter(db as unknown as D1Database,
      {read:async()=>body,write:async(_repo,_pr,value)=>{
        body=value;
        if (loseReply) {loseReply=false;throw new Error('socket closed after GitHub write');}
      }});
    await assert.rejects(writer.writeSection(scope),/socket closed/);
    assert.equal(db.sqlite.prepare("SELECT state FROM test_pr_body_writes WHERE work_id='work-1'").get()?.state,
      'writing');
    assert.equal(await writer.writeSection(scope),body);
    assert.equal(db.sqlite.prepare("SELECT state FROM test_pr_body_writes WHERE work_id='work-1'").get()?.state,
      'verified');
  } finally {db.close();}
});

test('a human edit before PATCH blocks the writer with its lock retained',async()=>{
  const {db,scope}=fixture();
  let body='Review notes\n',reads=0;
  try {
    const writer=new SharedTestPrBodyWriter(db as unknown as D1Database,
      {read:async()=>{if (++reads===2) body+='Human edit\n';return body;},
        write:async()=>{throw new Error('write must not run');}});
    await assert.rejects(writer.writeSection(scope),/changed_before_write/);
    assert.equal(db.sqlite.prepare("SELECT state FROM test_pr_body_writes WHERE work_id='work-1'").get()?.state,
      'blocked');
    assert.equal(db.sqlite.prepare("SELECT state FROM test_pr_body_locks WHERE repository='owner\/repo'").get()?.state,
      'held');
  } finally {db.close();}
});
