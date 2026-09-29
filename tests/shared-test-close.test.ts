import assert from 'node:assert/strict';
import test from 'node:test';
import {ImplementationTestBucket,ImplementationTestDatabase,seedRun,seedAttempt} from './helpers/implementation-fixture.ts';
import {SharedTestCloseStore} from '../src/shared-test-close.ts';
import {SharedTestDecisionStore,stagingManifestDigest} from '../src/shared-test-decision-store.ts';
import {routeTestPortal} from '../portal/test-environment/worker.ts';
import {sharedTestDemoReviewEvidence} from '../src/shared-test-demo-review.ts';
import {sha256Hex} from '../src/implementation-hash.ts';
import type {ImplementationRun} from '../src/implementation-store.ts';
import {SharedTestPrBodyWriter} from '../src/shared-test-pr-body.ts';
import {SharedTestReportStore} from '../src/shared-test-report.ts';
import {SharedTestReportDriver} from '../src/shared-test-report-driver.ts';

const now='2026-09-25T05:00:00Z';
const kinds=['app_screen','linear_screen','showboat','d1_read',
  'provider_receipt','github_receipt'];

function fixture() {
  const db=new ImplementationTestDatabase();
  seedRun(db,'run-1','issue-1');
  seedAttempt(db,'attempt-1');
  db.sqlite.exec("UPDATE agent_attempts SET node_id='shared_test_demo',state='completed',cleanup_state='destroyed',ended_at='now'");
  db.sqlite.prepare(`UPDATE orchestration_runs SET route_repository='owner/repo',
    route_github_installation_id='installation-1' WHERE run_id='run-1'`).run();
  db.sqlite.prepare(`INSERT INTO test_lease_requests
    (request_id,run_id,node_visit,attempt_id,task_id,candidate_commit,patch_sha256,
     state,created_at,updated_at) VALUES
    ('request-1','run-1',1,'attempt-1','issue-1',?,?,'granted',?,?)`)
    .run('a'.repeat(40),'b'.repeat(64),now,now);
  db.sqlite.prepare(`INSERT INTO test_leases
    (lease_id,request_id,run_id,attempt_id,task_id,task_key,task_title,team_id,
     stage,state,fence,base_manifest_id,base_traffic_revision,base_json,repository,
     branch,pull_request_number,candidate_commit,patch_sha256,created_at)
    VALUES ('lease-1','request-1','run-1','attempt-1','issue-1','SAC-1','Test','team-1',
      'shared_test_demo','active',1,'manifest-1','traffic-1','{}','owner/repo',
      'codex/test',150,?, ?,?)`).run('a'.repeat(40),'b'.repeat(64),now);
  db.sqlite.prepare(`UPDATE test_environment SET state='active',owner_run_id='run-1',
    owner_lease_id='lease-1',fence=1 WHERE site_id=1`).run();
  db.sqlite.prepare(`INSERT INTO test_lease_fence_epochs
    (lease_id,fence,run_id,reason,transition_revision,created_at)
    VALUES ('lease-1',1,'run-1','grant',1,?)`).run(now);
  db.sqlite.prepare(`INSERT INTO test_expected_events
    (expectation_id,run_id,lease_id,fence,task_id,team_id,kind,action,actor_id,
     key_version,challenge_sha256,before_sha256,after_sha256,marker_sha256,
     valid_from_ms,valid_until_ms,state,claimed_delivery_id,created_at)
    VALUES ('expectation-1','run-1','lease-1',1,'issue-1','team-1','Issue','update',
      'app-actor-1',1,?,?,?,?,1,9999999999999,'claimed','delivery-1',?)`)
    .run('c'.repeat(64),'d'.repeat(64),'e'.repeat(64),'f'.repeat(64),now);
  db.sqlite.prepare(`INSERT INTO test_provider_deliveries
    (delivery_id,payload_sha256,provider_time_ms,task_id,team_id,lease_id,run_id,classification,
     route,expectation_id,received_at)
    VALUES ('delivery-1',?,1790310701176,'issue-1','team-1','lease-1','run-1',
      'accepted','test','expectation-1',?)`).run('a'.repeat(64),now);
  db.sqlite.prepare(`INSERT INTO test_delivery_dispatch
    (delivery_id,run_id,lease_id,expectation_id,state,queue_work_id,
     created_at,updated_at) VALUES ('delivery-1','run-1','lease-1',
      'expectation-1','done','test-delivery:delivery-1',?,?)`).run(now,now);
  db.sqlite.prepare(`INSERT INTO test_attestations
    (attestation_id,task_id,run_id,lease_id,repository,candidate_commit,
     patch_sha256,manifest_id,manifest_revision,pull_request_number,
     base_manifest_id,state,observed_at)
    VALUES ('attestation-1','issue-1','run-1','lease-1','owner/repo',?,?,'manifest-1',
      1,150,'manifest-1','observed',?)`).run('a'.repeat(40),'b'.repeat(64),now);
  db.sqlite.prepare(`INSERT INTO test_resources
    (resource_id,run_id,lease_id,create_fence,kind,plan_state,provider_key,
     work_id,created_at,updated_at)
    VALUES ('resource-1','run-1','lease-1',1,'test_worker','created',
      'test-lease-1-worker','create-1',?,?)`).run(now,now);
  return {db,store:new SharedTestCloseStore(db as unknown as D1Database)};
}

test('a competing owner revision cannot disable the live expectation',async()=>{
  const {db,store}=fixture();
  try {
    const originalBatch=db.batch.bind(db);
    db.batch=async statements=>{
      db.sqlite.prepare(`UPDATE test_environment SET revision=revision+1
        WHERE site_id=1`).run();
      return originalBatch(statements);
    };
    await assert.rejects(store.quiesce('run-1','lease-1',1),/write_incomplete/);
    assert.equal(db.sqlite.prepare(`SELECT state FROM test_environment
      WHERE site_id=1`).get()?.state,'active');
    assert.equal(db.sqlite.prepare(`SELECT state FROM test_expected_events
      WHERE expectation_id='expectation-1'`).get()?.state,'claimed');
  } finally {db.close();}
});

test('close needs attached proof and owned absence before one atomic free transition',async()=>{
  const {db,store}=fixture();
  try {
    const fence=await store.quiesce('run-1','lease-1',1);
    assert.equal(fence,2);
    assert.equal(db.sqlite.prepare('SELECT state FROM test_expected_events').get()?.state,'disabled');
    await assert.rejects(store.cleaning('run-1','lease-1',fence),/not_ready/);
    for (const kind of kinds) db.sqlite.prepare(`INSERT INTO test_proof_items
      (proof_id,run_id,lease_id,phase,kind,classification,view_rule,source_sha256,
       object_key,content_type,byte_count,public_sha256,public_url,body_marker,
       read_at,projected_at,sanitizer_result)
      VALUES (?,'run-1','lease-1','first',?,'public_safe','allowlisted',?, ?,
       'text/plain',10,?,?,'deos-test-proof:lease-1',?,?, 'passed')`)
      .run(kind,kind,'a'.repeat(64),`proof/${kind}`,'b'.repeat(64),
        `https://example.com/${kind}`,now,now);
    db.sqlite.prepare(`INSERT INTO test_operations
      (work_id,run_id,lease_id,fence,kind,target,state,started_at,ended_at)
      VALUES ('remove-marker','run-1','lease-1',2,'linear_marker_remove',
        'issue-1','done',?,?)`).run(now,now);
    await store.cleaning('run-1','lease-1',fence);
    await assert.rejects(store.close('run-1','lease-1',fence),/absence_missing/);
    db.sqlite.prepare(`UPDATE test_resources SET plan_state='absent',absent_at=?`).run(now);
    db.sqlite.prepare(`INSERT INTO test_cleanup_checks
      (lease_id,resource_id,remove_work_id,remove_state,read_state,checked_at)
      VALUES ('lease-1','resource-1','remove-1','done','absent',?)`).run(now);
    db.sqlite.exec(`CREATE TRIGGER skip_test_closure BEFORE INSERT ON test_lease_closures
      BEGIN SELECT RAISE(IGNORE); END;`);
    await assert.rejects(store.close('run-1','lease-1',fence));
    assert.equal(db.sqlite.prepare('SELECT state FROM test_environment WHERE site_id=1').get()?.state,
      'cleaning');
    assert.equal(db.sqlite.prepare('SELECT state FROM test_leases WHERE lease_id=\'lease-1\'').get()?.state,
      'cleaning');
    assert.equal(db.sqlite.prepare('SELECT state FROM test_attestations').get()?.state,'observed');
    db.sqlite.exec('DROP TRIGGER skip_test_closure');
    const receipt=await store.close('run-1','lease-1',fence);
    assert.equal(receipt.leaseId,'lease-1');
    assert.equal((await store.close('run-1','lease-1',fence)).closeRevision,receipt.closeRevision);
    assert.equal(db.sqlite.prepare('SELECT state FROM test_environment WHERE site_id=1').get()?.state,'free');
    assert.equal(db.sqlite.prepare('SELECT state FROM test_attestations').get()?.state,'complete');
    assert.equal(db.sqlite.prepare('SELECT report_state FROM test_lease_closures').get()?.report_state,'pending');
    const bucket=new ImplementationTestBucket();
    let body='Human notes\n\n<!-- deos-test-proof:lease-1:start -->\nClose pending\n<!-- deos-test-proof:lease-1:end -->\n';
    let failWrite=true;
    const env={DB:db as unknown as D1Database,
      ARTIFACTS:bucket as unknown as R2Bucket} as Env;
    const report=new SharedTestReportDriver(env,()=>({
      json:async<T>(path:string,init?:RequestInit)=>{
        assert.equal(path,'/pulls/150');
        if (init?.method==='PATCH') {
          if (failWrite) {failWrite=false;throw new Error('GitHub body update unavailable');}
          body=JSON.parse(String(init.body)).body;
        }
        return {number:150,state:'open',draft:true,body,
          head:{sha:'a'.repeat(40),ref:'codex/test'},
          base:{repo:{full_name:'owner/repo'}}} as T;
      },
    }));
    await assert.rejects(report.resume(),/GitHub body update unavailable/);
    assert.equal(db.sqlite.prepare('SELECT state FROM test_environment').get()?.state,'free');
    assert.equal(db.sqlite.prepare('SELECT report_state FROM test_lease_closures').get()?.report_state,'pending');
    assert.equal(await report.resume(),'published');
    assert.match(body,/Human notes/);
    assert.match(body,/Final close report/);
    assert.equal(db.sqlite.prepare('SELECT report_state FROM test_lease_closures').get()?.report_state,'complete');
    assert.equal(await report.resume(),'idle');
    const object=await bucket.get('shared-test/reports/lease-1/close.json');
    assert.ok(object);
    assert.equal(JSON.parse(await object.text()).leaseId,'lease-1');
    const service={service_name:'portal',source_commit:'a'.repeat(40),deploy_version:'version',
      build_input_sha256:'c'.repeat(64),app_paths_json:'["portal/"]',provider_paths_json:'[]'};
    db.sqlite.prepare(`INSERT INTO staging_release_manifests
      VALUES ('manifest-1',1,'traffic-1',1,?,'now')`).run(await stagingManifestDigest([service]));
    db.sqlite.prepare(`INSERT INTO staging_release_services
      VALUES ('manifest-1','portal',?,'version',?,'["portal/"]','[]','now')`)
      .run('a'.repeat(40),'c'.repeat(64));
    db.sqlite.exec("UPDATE staging_release_pointer SET state='stable',manifest_id='manifest-1',manifest_revision=1,traffic_revision='traffic-1'");
    const decision=new SharedTestDecisionStore(env.DB);
    const candidate={runId:'run-1',candidateCommit:'a'.repeat(40),patchSha256:'b'.repeat(64),
      changedPaths:['portal/example.ts']};
    await decision.record(candidate);
    const release={...candidate,manifestId:'manifest-1',manifestRevision:1};
    assert.equal((await decision.releaseCheck(release)).allowed,true);
    db.sqlite.exec(`INSERT INTO artifact_manifests (manifest_id,run_id,attempt_id,r2_key,state,created_at)
      VALUES ('demo-manifest','run-1','attempt-1','manifest','complete','now')`);
    db.sqlite.exec("UPDATE agent_attempts SET manifest_id='demo-manifest'");
    for(const name of ['result.json','validation.txt']) {
      const content=name==='result.json'?'{"outcome":"completed"}':'Provider and app checks passed';
      await bucket.put(name,content);
      db.sqlite.prepare(`INSERT INTO artifacts
        (manifest_id,logical_name,r2_key,media_type,byte_size,sha256,policy_outcome,created_at)
        VALUES ('demo-manifest',?,?,'text/plain',?,?,'accepted','now')`)
        .run(name,name,content.length,await sha256Hex(content));
    }
    const proof='sanitized public evidence',proofSha=await sha256Hex(proof);
    for(const [index,kind] of kinds.entries()) {
      const id=`00000000-0000-4000-8000-${String(index).padStart(12,'0')}`;
      db.sqlite.prepare(`UPDATE test_proof_items SET proof_id=?,public_url=?,public_sha256=? WHERE kind=?`)
        .run(id,`https://deos-shared-test-proof.skundu.workers.dev/proof/${id}`,proofSha,kind);
    }
    const work={run_id:'run-1',pr_head_sha:'a'.repeat(40),patch_sha:'b'.repeat(64),
      change_id:'sample',approved_design_sha:'c'.repeat(40),tested_base_sha:'d'.repeat(40),tree_sha:'e'.repeat(40)} as ImplementationRun;
    const proofFetch=(async()=>new Response(proof)) as typeof fetch;
    const review=await sharedTestDemoReviewEvidence(env.DB,env.ARTIFACTS,work,proofFetch);
    assert.equal(review.evidence.length,kinds.length);
    assert.ok(review.sources.some(s=>s.path==='context/shared-test-result.json'));
    assert.ok(review.sources.some(s=>s.path==='context/shared-test-validation.txt'));
    for(const item of review.evidence)assert.equal(await (await bucket.get(item.r2Key))!.text(),proof);
    await assert.rejects(sharedTestDemoReviewEvidence(env.DB,env.ARTIFACTS,work,
      (async()=>new Response('changed')) as typeof fetch),/hash_changed/);
    const imageId='00000000-0000-4000-8000-000000000000';
    db.sqlite.prepare("UPDATE test_proof_items SET public_url='https://foreign.example/private' WHERE proof_id=?").run(imageId);
    await assert.rejects(sharedTestDemoReviewEvidence(env.DB,env.ARTIFACTS,work,
      (async()=>{throw new Error('must not fetch a foreign origin');}) as typeof fetch),/url_changed/);
    db.sqlite.prepare('UPDATE test_proof_items SET public_url=? WHERE proof_id=?')
      .run(`https://deos-shared-test-proof.skundu.workers.dev/proof/${imageId}`,imageId);

    const portalEnv={DB:env.DB,ARTIFACTS:env.ARTIFACTS,COORDINATOR:{} as Fetcher,
      ACCESS_TEAM_DOMAIN:'test',ACCESS_AUD:'aud',ALLOWED_EMAIL:'allowed@example.com'};
    const auth=(async()=>({email:'allowed@example.com'})) as typeof import('../portal/src/auth.ts').verifyAccess;
    // A historical erroneous close must not authorize release or serve a pass report.
    db.sqlite.exec("UPDATE agent_attempts SET state='blocked'");
    assert.equal((await decision.releaseCheck(release)).allowed,false);
    await assert.rejects(sharedTestDemoReviewEvidence(env.DB,env.ARTIFACTS,work,proofFetch),/evidence_missing/);
    await assert.rejects(store.close('run-1','lease-1',2),/demo_not_completed/);
    assert.equal((await routeTestPortal(new Request('https://deos-test.voxdez.com/reports/lease-1'),portalEnv,auth)).status,404);
    await assert.rejects(new SharedTestReportStore(env.DB,env.ARTIFACTS,new SharedTestPrBodyWriter(env.DB,{read:async()=>{throw new Error('must not read');},write:async()=>{throw new Error('must not write');}})).publish('run-1','lease-1'),/close_missing/);

  } finally {db.close();}
});


test('a blocked demo cannot use complete public proof to race its failure snapshot',async()=>{
  const {db,store}=fixture();
  try {
    for(const kind of kinds)db.sqlite.prepare(`INSERT INTO test_proof_items
      (proof_id,run_id,lease_id,phase,kind,classification,view_rule,source_sha256,object_key,content_type,byte_count,
        public_sha256,public_url,body_marker,read_at,projected_at,sanitizer_result)
      VALUES (?,'run-1','lease-1','first',?,'public_safe','allowlisted',?,'raw','text/plain',10,?,'https://proof','marker','now','now','passed')`)
      .run(kind,kind,'a'.repeat(64),'b'.repeat(64));
    db.sqlite.exec("UPDATE agent_attempts SET state='blocked'");
    await store.quiesce('run-1','lease-1',1);
    await assert.rejects(store.cleaning('run-1','lease-1',2),/demo_not_completed/);
    assert.equal(db.sqlite.prepare('SELECT state FROM test_environment').get()!.state,'quiescing');
    assert.equal(db.sqlite.prepare('SELECT plan_state FROM test_resources').get()!.plan_state,'created');
    await assert.rejects(store.close('run-1','lease-1',2),/demo_not_completed/);
    assert.equal(db.sqlite.prepare('SELECT state FROM test_attestations').get()!.state,'observed');
  }finally{db.close();}
});
