import assert from 'node:assert/strict';
import test from 'node:test';
import {ImplementationTestDatabase,seedAttempt,seedRun} from './helpers/implementation-fixture.ts';
import {SharedTestLeaseStore, sharedTestRequestId, stableStagingBase} from '../src/shared-test-lease.ts';
import {stagingManifestDigest} from '../src/shared-test-decision-store.ts';
import {ImplementationStore} from '../src/implementation-store.ts';
import {ImplementationTestBucket} from './helpers/implementation-fixture.ts';
import {implementationPolicy} from '../src/implementation-contract.ts';

const service = {serviceName:'portal',sourceCommit:'a'.repeat(40),deployVersion:'version-1',
  buildInputSha256:'b'.repeat(64),trafficPercent:100};
const traffic = {revision:'traffic-1',services:[service]};
const base = stableStagingBase(traffic,traffic);
const first = {runId:'run-1',nodeVisit:3,attemptId:'attempt-1',taskId:'issue-1',
  candidateCommit:'c'.repeat(40),patchSha256:'d'.repeat(64)};
const second = {...first,runId:'run-2',attemptId:'attempt-2',taskId:'issue-2'};

async function fixture() {
  const db = new ImplementationTestDatabase();
  const saved={service_name:service.serviceName,source_commit:service.sourceCommit,
    deploy_version:service.deployVersion,build_input_sha256:service.buildInputSha256,
    app_paths_json:'["portal/"]',provider_paths_json:'["src/linear-"]'};
  const digest=await stagingManifestDigest([saved]);
  db.sqlite.prepare(`INSERT INTO staging_release_manifests
    (manifest_id,revision,traffic_revision,service_count,digest_sha256,recorded_at)
    VALUES ('manifest-1',1,'traffic-1',1,?,'now')`).run(digest);
  db.sqlite.prepare(`INSERT INTO staging_release_services
    (manifest_id,service_name,source_commit,deploy_version,build_input_sha256,
     app_paths_json,provider_paths_json,read_at) VALUES ('manifest-1',?,?,?,?,?,?, 'now')`)
    .run(saved.service_name,saved.source_commit,saved.deploy_version,saved.build_input_sha256,
      saved.app_paths_json,saved.provider_paths_json);
  db.sqlite.prepare(`UPDATE staging_release_pointer SET state='stable',manifest_id='manifest-1',
    manifest_revision=1,traffic_revision='traffic-1',revision=1 WHERE site_id=1`).run();
  const store = new SharedTestLeaseStore(db as unknown as D1Database);
  const grant = async (request: typeof first,requireCurrent=false) => store.grant({...request,
    requestId:await sharedTestRequestId(request), taskKey:request.taskId,taskTitle:'Test issue',
    teamId:'team-1',stage:'shared_test_demo',repository:'owner/repo',branch:'codex/test',
    pullRequestNumber:7,baseManifestId:'manifest-1',baseTrafficRevision:'traffic-1',
    base,pointerRevision:1},new Date('2026-09-25T10:00:00Z'),requireCurrent);
  return {db,store,grant};
}

test('staging reads require two identical complete 100 percent snapshots', () => {
  assert.deepEqual(base,traffic);
  assert.throws(() => stableStagingBase(traffic,{...traffic,revision:'traffic-2'}),/unstable/);
  assert.throws(() => stableStagingBase(traffic,{...traffic,services:[{...service,trafficPercent:99}]}),/incomplete/);
  assert.throws(() => stableStagingBase(traffic,{...traffic,services:[{...service,deployVersion:'version-2'}]}),/changed/);
});

test('one oldest request grants and remains owner after heartbeat loss', async () => {
  const {db,store,grant} = await fixture();
  try {
    const q1=await store.request(first);
    const again=await store.request(first);
    assert.equal(again.queue_number,q1.queue_number);
    const q2=await store.request(second);
    assert.ok(q2.queue_number>q1.queue_number);
    assert.equal((await grant(second)).state,'waiting');
    const owned=await grant(first);
    assert.equal(owned.state,'granted');
    assert.equal((await grant(first)).leaseId,owned.leaseId);
    assert.equal((await grant(second)).state,'waiting');
    const expired=await store.fenceExpired(new Date('2026-09-25T10:02:01Z'));
    assert.equal(expired?.leaseId,owned.leaseId);
    assert.equal(expired?.fence,owned.fence!+1);
    assert.equal((await store.environment()).state,'quiescing');
    assert.equal((await grant(second)).state,'waiting');
    assert.equal((await grant(first)).state,'waiting');
    await assert.rejects(store.heartbeat(first.runId,first.attemptId,owned.leaseId!,owned.fence!),/fenced/);
    const rows=db.sqlite.prepare('SELECT lease_id,fence,reason FROM test_lease_fence_epochs ORDER BY fence').all();
    assert.deepEqual(rows.map(row=>row.reason),['grant','heartbeat_expired']);
  } finally { db.close(); }
});

test('a canceled or changed queue request cannot take the site', async () => {
  const {db,store,grant}=await fixture();
  try {
    await store.request(first);
    await assert.rejects(store.request({...first,candidateCommit:'e'.repeat(40)}),/identity_conflict/);
    db.sqlite.prepare("UPDATE test_lease_requests SET state='canceled' WHERE run_id='run-1'").run();
    assert.equal((await grant(first)).state,'waiting');
    assert.equal((await store.environment()).state,'free');
  } finally {db.close();}
});

test('strict grant requires the active node and exact saved draft candidate',async()=>{
  const {db,store,grant}=await fixture();
  try {
    seedRun(db,first.runId,first.taskId);
    const implementation=new ImplementationStore(db as unknown as D1Database,
      new ImplementationTestBucket() as unknown as R2Bucket);
    await implementation.allocate({version:1,runId:first.runId,repository:'owner/repo',
      change:'sample',branch:'deos/agent/SAC-172/run-1',approvedDesignSha:'a'.repeat(40),
      testedBaseSha:'b'.repeat(40),policy:implementationPolicy,approvedFiles:[],
      issue:{},receipts:{},requirements:{kinds:[],reasons:[],blockedProviders:[]}},
      {userId:'human',revision:1},'SAC-172',1);
    db.sqlite.prepare(`UPDATE implementation_runs SET pr_head_sha=?,patch_sha=?,pr_number=7
      WHERE run_id=?`).run(first.candidateCommit,first.patchSha256,first.runId);
    await store.request(first);
    assert.equal((await grant(first,true)).state,'waiting');
    db.sqlite.prepare(`UPDATE orchestration_runs SET current_node='shared_test_demo',
      status='active' WHERE run_id=?`).run(first.runId);
    assert.equal((await grant(first,true)).state,'granted');
  } finally {db.close();}
});

test('a terminal queue head leaves the queue only after Sandbox destruction',async()=>{
  const {db,store}=await fixture();
  try {
    seedRun(db,first.runId,first.taskId);
    seedAttempt(db,first.attemptId,first.runId);
    await store.request(first);
    await store.request(second);
    db.sqlite.prepare(`UPDATE agent_attempts SET state='failed',cleanup_state='pending'
      WHERE attempt_id=?`).run(first.attemptId);
    assert.equal(await store.expireTerminalHead(),null);
    db.sqlite.prepare(`UPDATE agent_attempts SET cleanup_state='destroyed'
      WHERE attempt_id=?`).run(first.attemptId);
    assert.deepEqual(await store.expireTerminalHead(),
      {requestId:await sharedTestRequestId(first),state:'superseded'});
    assert.equal(db.sqlite.prepare(`SELECT state FROM test_lease_requests
      WHERE request_id=?`).get(await sharedTestRequestId(first))?.state,'superseded');
    assert.equal((await store.environment()).state,'free');
  } finally {db.close();}
});

test('timed visits keep one queue place and an unstarted attempt can be safely canceled',async()=>{
  const {db,store}=await fixture();
  try {
    seedRun(db,first.runId,first.taskId);
    await store.request(first);
    db.sqlite.prepare(`UPDATE orchestration_runs SET current_node='shared_test_demo',
      current_visit_sequence=9,status='active' WHERE run_id=?`).run(first.runId);
    assert.equal(await store.expireTerminalHead(),null);
    db.sqlite.prepare(`UPDATE orchestration_runs SET current_node='implementation_build'
      WHERE run_id=?`).run(first.runId);
    assert.deepEqual(await store.expireTerminalHead(),
      {requestId:await sharedTestRequestId(first),state:'superseded'});
  } finally {db.close();}
});

test('replacement attempt keeps its queue number only after the old Sandbox is destroyed',async()=>{
  const {db,store}=await fixture();
  try {
    seedRun(db,first.runId,first.taskId);
    seedAttempt(db,first.attemptId,first.runId);
    db.sqlite.prepare(`UPDATE orchestration_runs SET current_node='shared_test_demo',
      status='active' WHERE run_id=?`).run(first.runId);
    const queued=await store.request(first);
    const replacement={...first,attemptId:'attempt-retry'};
    await assert.rejects(store.replaceAttempt(replacement,first.attemptId),/not_final/);
    db.sqlite.prepare(`UPDATE agent_attempts SET state='failed',cleanup_state='destroyed'
      WHERE attempt_id=?`).run(first.attemptId);
    const updated=await store.replaceAttempt(replacement,first.attemptId);
    assert.equal(updated.queue_number,queued.queue_number);
    assert.equal(updated.attempt_id,replacement.attemptId);
    await assert.rejects(store.request(first),/identity_conflict/);
  } finally {db.close();}
});
