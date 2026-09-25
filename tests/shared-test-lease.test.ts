import assert from 'node:assert/strict';
import test from 'node:test';
import {ImplementationTestDatabase} from './helpers/implementation-fixture.ts';
import {SharedTestLeaseStore, sharedTestRequestId, stableStagingBase} from '../src/shared-test-lease.ts';

const service = {serviceName:'portal',sourceCommit:'a'.repeat(40),deployVersion:'version-1',
  buildInputSha256:'b'.repeat(64),trafficPercent:100};
const traffic = {revision:'traffic-1',services:[service]};
const base = stableStagingBase(traffic,traffic);
const first = {runId:'run-1',nodeVisit:3,attemptId:'attempt-1',taskId:'issue-1',
  candidateCommit:'c'.repeat(40),patchSha256:'d'.repeat(64)};
const second = {...first,runId:'run-2',attemptId:'attempt-2',taskId:'issue-2'};

function fixture() {
  const db = new ImplementationTestDatabase();
  db.sqlite.prepare(`UPDATE staging_release_pointer SET state='stable',manifest_id='manifest-1',
    traffic_revision='traffic-1',revision=1 WHERE site_id=1`).run();
  const store = new SharedTestLeaseStore(db as unknown as D1Database);
  const grant = async (request: typeof first) => store.grant({...request,
    requestId:await sharedTestRequestId(request), taskKey:request.taskId,taskTitle:'Test issue',
    teamId:'team-1',stage:'shared_test_demo',repository:'owner/repo',branch:'codex/test',
    pullRequestNumber:7,baseManifestId:'manifest-1',baseTrafficRevision:'traffic-1',
    base,pointerRevision:1},new Date('2026-09-25T10:00:00Z'));
  return {db,store,grant};
}

test('staging reads require two identical complete 100 percent snapshots', () => {
  assert.deepEqual(base,traffic);
  assert.throws(() => stableStagingBase(traffic,{...traffic,revision:'traffic-2'}),/unstable/);
  assert.throws(() => stableStagingBase(traffic,{...traffic,services:[{...service,trafficPercent:99}]}),/incomplete/);
  assert.throws(() => stableStagingBase(traffic,{...traffic,services:[{...service,deployVersion:'version-2'}]}),/changed/);
});

test('one oldest request grants and remains owner after heartbeat loss', async () => {
  const {db,store,grant} = fixture();
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
  const {db,store,grant}=fixture();
  try {
    await store.request(first);
    await assert.rejects(store.request({...first,candidateCommit:'e'.repeat(40)}),/identity_conflict/);
    db.sqlite.prepare("UPDATE test_lease_requests SET state='canceled' WHERE run_id='run-1'").run();
    assert.equal((await grant(first)).state,'waiting');
    assert.equal((await store.environment()).state,'free');
  } finally {db.close();}
});
