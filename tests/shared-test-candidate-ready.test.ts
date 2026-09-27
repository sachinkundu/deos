import assert from 'node:assert/strict';
import test from 'node:test';
import {ImplementationTestDatabase} from './helpers/implementation-fixture.ts';
import {sharedTestCandidateReady} from '../src/shared-test-candidate-ready.ts';

const leaseId='a'.repeat(64),candidate='b'.repeat(40),patch='c'.repeat(64);
const base={revision:'traffic-1',services:[
  {serviceName:'portal',sourceCommit:'d'.repeat(40),
    deployVersion:'11111111-1111-4111-8111-111111111111',
    buildInputSha256:'e'.repeat(64),trafficPercent:100},
  {serviceName:'bettaview',sourceCommit:'f'.repeat(40),
    deployVersion:'22222222-2222-4222-8222-222222222222',
    buildInputSha256:'0'.repeat(64),trafficPercent:100},
]};
const lease={lease_id:leaseId,run_id:'run-1',fence:1,candidate_commit:candidate,
  patch_sha256:patch,base_manifest_id:'manifest-1',
  base_traffic_revision:base.revision,base_json:JSON.stringify(base)};

test('candidate demo waits for readback of every affected service and exact fence',async()=>{
  const db=new ImplementationTestDatabase();
  try {
    db.sqlite.prepare(`INSERT INTO staging_release_manifests
      (manifest_id,revision,traffic_revision,service_count,digest_sha256,recorded_at)
      VALUES ('manifest-1',1,'traffic-1',2,'digest','now')`).run();
    for(const [name,root] of [['portal','portal/'],['bettaview','portal/bettaview/']])
      db.sqlite.prepare(`INSERT INTO staging_release_services
        (manifest_id,service_name,source_commit,deploy_version,build_input_sha256,
         app_paths_json,provider_paths_json,read_at)
        VALUES ('manifest-1',?,'source','version','build',?,'[]','now')`)
        .run(name,JSON.stringify([root]));
    db.sqlite.prepare(`INSERT INTO test_task_decisions
      (run_id,candidate_commit,patch_sha256,manifest_id,manifest_revision,
       changed_paths_sha256,choice,matched_paths_json,created_at)
      VALUES (?,?,?,'manifest-1',1,'digest','test_required',?,'now')`)
      .run(lease.run_id,candidate,patch,JSON.stringify([
        'portal/src/main.tsx','portal/bettaview/src/App.tsx']));
    db.sqlite.prepare(`INSERT INTO test_lease_requests
      (request_id,run_id,node_visit,attempt_id,task_id,candidate_commit,patch_sha256,
       state,created_at,updated_at)
      VALUES ('request-1','run-1',1,'attempt-1','issue-1',?,?,'granted','now','now')`)
      .run(candidate,patch);
    db.sqlite.prepare(`INSERT INTO test_leases
      (lease_id,request_id,run_id,attempt_id,task_id,task_key,task_title,team_id,
       stage,state,fence,base_manifest_id,base_traffic_revision,base_json,
       repository,branch,pull_request_number,candidate_commit,patch_sha256,created_at)
      VALUES (?,'request-1','run-1','attempt-1','issue-1','SAC-1','Test','team-1',
        'shared_test_demo','active',1,'manifest-1','traffic-1',?,
        'owner/repo','codex/test',150,?,?,'now')`)
      .run(leaseId,lease.base_json,candidate,patch);
    assert.equal(await sharedTestCandidateReady(db as unknown as D1Database,lease),false);
    const save=(service:string,fence:number)=>db.sqlite.prepare(`INSERT OR REPLACE INTO
      test_candidate_service_readbacks (lease_id,service_name,resource_id,
        candidate_commit,build_input_sha256,running_version_id,fence,
        first_read_at,second_read_at) VALUES (?,?,?,?,?,?,?,'one','two')`)
      .run(leaseId,service,`test-worker:${leaseId}:${service}`,candidate,
        '1'.repeat(64),'33333333-3333-4333-8333-333333333333',fence);
    save('portal',1);
    assert.equal(await sharedTestCandidateReady(db as unknown as D1Database,lease),false);
    save('bettaview',2);
    assert.equal(await sharedTestCandidateReady(db as unknown as D1Database,lease),false);
    save('bettaview',1);
    assert.equal(await sharedTestCandidateReady(db as unknown as D1Database,lease),true);
    db.sqlite.prepare(`UPDATE test_task_decisions SET matched_paths_json=? WHERE run_id=?`)
      .run(JSON.stringify(['portal/bettaview/src/App.tsx']),lease.run_id);
    db.sqlite.prepare(`DELETE FROM test_candidate_service_readbacks WHERE service_name='portal'`).run();
    assert.equal(await sharedTestCandidateReady(db as unknown as D1Database,lease),true);
  }finally{db.close();}
});
