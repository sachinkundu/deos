import assert from 'node:assert/strict';
import test from 'node:test';
import {ImplementationTestBucket,ImplementationTestDatabase,seedRun} from './helpers/implementation-fixture.ts';
import {SharedTestStructuredProofStore} from '../src/shared-test-structured-proof.ts';
import {SharedTestStructuredProofDriver} from '../src/shared-test-structured-proof-driver.ts';
import {routePublicProof} from '../portal/test-proof/worker.ts';
import {sharedTestProofUrl} from '../src/shared-test-proof-url.ts';

const now='2026-09-27T10:00:00Z';
const candidate='a'.repeat(40);
const version='11111111-1111-4111-8111-111111111111';
const base={revision:'traffic-1',services:[{serviceName:'portal',
  sourceCommit:'e'.repeat(40),deployVersion:version,
  buildInputSha256:'c'.repeat(64),trafficPercent:100}]};
const checkedPull={number:150,state:'open',draft:true,
  head:{sha:candidate,ref:'codex/test'},
  base:{repo:{full_name:'owner/repo'}}};

function fixture() {
  const db=new ImplementationTestDatabase(),bucket=new ImplementationTestBucket();
  seedRun(db,'run-1','issue-1');
  db.sqlite.prepare(`UPDATE orchestration_runs SET route_repository='owner/repo',
    route_github_installation_id='installation-1' WHERE run_id='run-1'`).run();
  db.sqlite.prepare(`INSERT INTO staging_release_manifests
    (manifest_id,revision,traffic_revision,service_count,digest_sha256,recorded_at)
    VALUES ('manifest-1',1,'traffic-1',1,'digest',?)`).run(now);
  db.sqlite.prepare(`INSERT INTO staging_release_services
    (manifest_id,service_name,source_commit,deploy_version,build_input_sha256,
     app_paths_json,provider_paths_json,read_at)
    VALUES ('manifest-1','portal',?,?,?,?,'[]',?)`)
    .run(base.services[0].sourceCommit,version,'c'.repeat(64),
      JSON.stringify(['portal/']),now);
  db.sqlite.prepare(`INSERT INTO test_task_decisions
    (run_id,candidate_commit,patch_sha256,manifest_id,manifest_revision,
     changed_paths_sha256,choice,matched_paths_json,created_at)
    VALUES ('run-1',?,?,'manifest-1',1,'digest','test_required',?,?)`)
    .run(candidate,'b'.repeat(64),JSON.stringify(['portal/src/main.tsx']),now);
  db.sqlite.prepare(`INSERT INTO test_lease_requests
    (request_id,run_id,node_visit,attempt_id,task_id,candidate_commit,patch_sha256,
     state,created_at,updated_at) VALUES
    ('request-1','run-1',1,'attempt-1','issue-1',?,?,'granted',?,?)`)
    .run(candidate,'b'.repeat(64),now,now);
  db.sqlite.prepare(`INSERT INTO test_leases
    (lease_id,request_id,run_id,attempt_id,task_id,task_key,task_title,team_id,
     stage,state,fence,base_manifest_id,base_traffic_revision,base_json,
     repository,branch,pull_request_number,candidate_commit,patch_sha256,created_at)
    VALUES ('ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff','request-1','run-1','attempt-1','issue-1','SAC-182',
      'Approved title','team-1','shared_test_demo','active',1,'manifest-1',
      'traffic-1',?,'owner/repo','codex/test',150,?,?,?)`)
    .run(JSON.stringify(base),candidate,'b'.repeat(64),now);
  db.sqlite.prepare(`UPDATE test_environment SET state='active',
    owner_run_id='run-1',owner_lease_id='ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',fence=1 WHERE site_id=1`).run();
  db.sqlite.prepare(`INSERT INTO test_candidate_service_readbacks
    (lease_id,service_name,resource_id,candidate_commit,build_input_sha256,
     running_version_id,fence,first_read_at,second_read_at)
    VALUES ('ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff','portal','test-worker:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff:portal',?,?,?,1,?,?)`)
    .run(candidate,'c'.repeat(64),version,now,now);
  db.sqlite.prepare(`INSERT INTO test_expected_events
    (expectation_id,run_id,lease_id,fence,task_id,team_id,kind,action,actor_id,
     key_version,challenge_sha256,before_sha256,after_sha256,marker_sha256,
     valid_from_ms,valid_until_ms,state,claimed_delivery_id,created_at)
    VALUES ('expectation-1','run-1','ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',1,'issue-1','team-1','Issue',
      'update','app-actor-1',1,?,?,?,?,1,9999999999999,'claimed',
      'delivery-secret',?)`)
    .run('1'.repeat(64),'2'.repeat(64),'3'.repeat(64),'4'.repeat(64),now);
  db.sqlite.prepare(`INSERT INTO test_provider_deliveries
    (delivery_id,payload_sha256,provider_time_ms,task_id,team_id,lease_id,
     run_id,classification,route,received_at,result_json)
    VALUES ('delivery-secret',?,1790310701176,'issue-1','team-1','ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
      'run-1','accepted','test',?,?)`)
    .run('d'.repeat(64),now,JSON.stringify({private:'marker-secret'}));
  db.sqlite.prepare(`INSERT INTO test_delivery_dispatch
    (delivery_id,run_id,lease_id,expectation_id,state,queue_work_id,
     created_at,updated_at)
    VALUES ('delivery-secret','run-1','ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff','expectation-1','done',
      'test-delivery:delivery-secret',?,?)`).run(now,now);
  const env={DB:db as unknown as D1Database,
    ARTIFACTS:bucket as unknown as R2Bucket} as Env;
  return {db,bucket,env,
    store:new SharedTestStructuredProofStore(env.DB,env.ARTIFACTS)};
}

test('structured proof publishes three fixed-field public receipts and remains idempotent',async()=>{
  const f=fixture();
  try {
    const driver=new SharedTestStructuredProofDriver(f.env,()=>({
      json:async<T>()=>({...checkedPull,body:'private PR body'} as T),
    }));
    assert.equal(await driver.resume(),'published');
    assert.equal(await driver.resume(),'idle');
    const rows=f.db.sqlite.prepare(`SELECT proof_id,kind FROM test_proof_items
      ORDER BY kind`).all() as Array<{proof_id:string;kind:string}>;
    assert.deepEqual(rows.map(row=>row.kind),
      ['d1_read','github_receipt','provider_receipt']);
    for(const row of rows) {
      const url=sharedTestProofUrl(row.proof_id);
      const response=await routePublicProof(new Request(url),f.env);
      assert.equal(response.status,200);
      const publicText=await response.text();
      assert.doesNotMatch(publicText,/delivery-secret|marker-secret|private PR body|ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff|run-1/);
      assert.equal(JSON.parse(publicText).task==='SAC-182' || row.kind==='github_receipt',true);
      const raw=await f.bucket.get(`shared-test/raw/ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff/${row.proof_id}.json`);
      assert.ok(raw);
      assert.notEqual(await raw.text(),publicText);
    }
  }finally{f.db.close();}
});

test('changed GitHub head and incomplete Linear dispatch cannot create receipts',async()=>{
  const f=fixture();
  try {
    await assert.rejects(f.store.saveGitHubReceipt('run-1','ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',{
      ...checkedPull,head:{...checkedPull.head,sha:'e'.repeat(40)}}),
    /test_github_proof_pull_changed/);
    f.db.sqlite.prepare(`UPDATE test_delivery_dispatch SET state='pending'`).run();
    await assert.rejects(f.store.saveProviderReceipt('run-1','ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'),
      /test_provider_proof_delivery_missing_or_duplicate/);
    await assert.rejects(f.store.saveD1Read('run-1','ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'),
      /test_provider_proof_delivery_missing_or_duplicate/);
    assert.equal(f.db.sqlite.prepare(`SELECT COUNT(*) AS n FROM test_proof_items`).get()?.n,0);
  }finally{f.db.close();}
});

test('D1 readback survives quiescing only with its saved earlier fence',async()=>{
  const f=fixture();
  try {
    f.db.sqlite.prepare(`UPDATE test_leases SET state='quiescing',fence=2`).run();
    f.db.sqlite.prepare(`UPDATE test_environment SET state='quiescing',fence=2`).run();
    await assert.rejects(f.store.saveD1Read('run-1',
      'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'),
    /test_d1_proof_candidate_fence_invalid/);
    f.db.sqlite.prepare(`INSERT INTO test_lease_fence_epochs
      (lease_id,fence,run_id,reason,transition_revision,created_at)
      VALUES (?,1,'run-1','grant',1,?)`)
      .run('ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',now);
    await f.store.saveD1Read('run-1',
      'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
    assert.equal(f.db.sqlite.prepare(`SELECT COUNT(*) AS n FROM test_proof_items
      WHERE kind='d1_read'`).get()?.n,1);
  }finally{f.db.close();}
});
