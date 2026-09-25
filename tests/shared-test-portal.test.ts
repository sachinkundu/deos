import assert from 'node:assert/strict';
import test from 'node:test';
import {ImplementationTestBucket,ImplementationTestDatabase} from './helpers/implementation-fixture.ts';
import {routeTestPortal} from '../portal/test-environment/worker.ts';

const authenticate=async()=>({email:'allowed@example.com'});

test('status shows the issue first while owned and says free only without an owner',async()=>{
  const db=new ImplementationTestDatabase(),bucket=new ImplementationTestBucket();
  const env={DB:db as unknown as D1Database,ARTIFACTS:bucket as unknown as R2Bucket,
    ACCESS_TEAM_DOMAIN:'test',ACCESS_AUD:'aud',ALLOWED_EMAIL:'allowed@example.com'};
  try {
    let response=await routeTestPortal(new Request('https://deos-test.voxdez.com/'),env,
      authenticate as typeof import('../portal/src/auth.ts').verifyAccess);
    assert.match(await response.text(),/The site is ready/);
    db.sqlite.prepare(`INSERT INTO test_lease_requests
      (request_id,run_id,node_visit,attempt_id,task_id,candidate_commit,patch_sha256,
       state,created_at,updated_at) VALUES
      ('request-1','run-1',1,'attempt-1','issue-1',?,?,'granted','now','now')`)
      .run('a'.repeat(40),'b'.repeat(64));
    db.sqlite.prepare(`INSERT INTO test_leases
      (lease_id,request_id,run_id,attempt_id,task_id,task_key,task_title,team_id,
       stage,state,fence,base_manifest_id,base_traffic_revision,base_json,repository,
       branch,pull_request_number,candidate_commit,patch_sha256,created_at)
      VALUES ('lease-1','request-1','run-1','attempt-1','issue-1','SAC-182',
        'Test BettaView review','team-1','shared_test_demo','active',1,
        'manifest-1','traffic-1','{}','owner/repo','codex/test',150,?,?,'now')`)
      .run('a'.repeat(40),'b'.repeat(64));
    db.sqlite.prepare(`UPDATE test_environment SET state='active',owner_run_id='run-1',
      owner_lease_id='lease-1',fence=1 WHERE site_id=1`).run();
    response=await routeTestPortal(new Request('https://deos-test.voxdez.com/'),env,
      authenticate as typeof import('../portal/src/auth.ts').verifyAccess);
    const html=await response.text();
    assert.match(html,/<h1>SAC-182 · Test BettaView review<\/h1>/);
    assert.match(html,/Test in use/);
    assert.match(html,/manifest-1/);
    assert.doesNotMatch(html,/The site is ready/);
  } finally {db.close();}
});
