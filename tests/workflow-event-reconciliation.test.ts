import assert from 'node:assert/strict';
import test from 'node:test';
import { reconcileWorkflowEvents } from '../src/workflow-event-reconciliation.ts';
import { D1OrchestrationStore } from '../src/orchestration-store.ts';
import { ImplementationTestDatabase, ImplementationTestBucket, seedRun } from './helpers/implementation-fixture.ts';

const now = new Date('2026-09-16T14:00:00.000Z');
const older = '2026-09-16T13:55:00.000Z';
async function fixture() {
  const db = new ImplementationTestDatabase(), bucket = new ImplementationTestBucket();
  seedRun(db);
  db.sqlite.prepare("UPDATE orchestration_runs SET status='awaiting_human'").run();
  const store = new D1OrchestrationStore(db as unknown as D1Database);
  for (const [id, sent] of [['old',older],['fresh',now.toISOString()],['claimed',older]]) {
    await store.insertInboxEvent({ deliveryId:id,runId:'run-1',correlationId:'correlation-1',
      eventKind:'Issue.update',actorId:'human',actorType:'user',providerTime:older,
      fromStateId:'human-state',fromStateName:'Human Review',toStateId:'merging',toStateName:'Merging',payloadDigest:id }, older);
    await store.markInboxState(id,'pending','sent',sent);
  }
  await store.claimInboxEvent('claimed','run-1',older);
  const sent: unknown[] = [];
  const handle = {status:async()=>({status:'waiting'}),sendEvent:async(event:unknown)=>{sent.push(event);}};
  const env = {DB:db,ARTIFACTS:bucket,ORCHESTRATION_WORKFLOW:{get:async()=>handle}} as unknown as Parameters<typeof reconcileWorkflowEvents>[0];
  return {db,bucket,store,handle,env,sent};
}

test('resends only aged unclaimed wakes and leaves the decision to the workflow', async () => {
  const f = await fixture();
  try {
    await reconcileWorkflowEvents(f.env,now);
    assert.deepEqual(f.sent,[{type:'linear-event',payload:{deliveryId:'old'}}]);
    assert.equal((await f.store.findInboxEvent('old'))?.state,'sent');
    assert.equal((await f.store.findRun('run-1'))?.status,'awaiting_human');
    await reconcileWorkflowEvents(f.env,now);
    assert.equal(f.sent.length,1);
    await f.store.claimInboxEvent('old','run-1',now.toISOString());
    await f.store.claimInboxEvent('fresh','run-1',now.toISOString());
    await reconcileWorkflowEvents(f.env,new Date(now.getTime()+10*60_000));
    assert.equal(f.sent.length,1);
  } finally {f.db.close();}
});

test('does not wake retired, paused or concurrently consumed runs', async () => {
  const f = await fixture();
  try {
    f.db.sqlite.prepare("UPDATE orchestration_runs SET status='canceled'").run();
    await reconcileWorkflowEvents(f.env,now);
    f.db.sqlite.prepare("UPDATE orchestration_runs SET status='awaiting_human'").run();
    f.handle.status=async()=>({status:'paused'});
    await reconcileWorkflowEvents(f.env,now);
    f.handle.status=async()=>{await f.store.claimInboxEvent('old','run-1',now.toISOString());return {status:'waiting'};};
    await reconcileWorkflowEvents(f.env,now);
    assert.deepEqual(f.sent,[]);
  } finally {f.db.close();}
});

test('preserves a failed send for retry and records its original cause', async () => {
  const f = await fixture();
  try {
    const error = new Error('provider send unavailable',{cause:new Error('upstream reset')});
    f.handle.sendEvent=async()=>{throw error;};
    await assert.rejects(reconcileWorkflowEvents(f.env,now),(caught:unknown)=>caught instanceof AggregateError && caught.cause===error);
    assert.equal(f.db.sqlite.prepare("SELECT sent_at FROM workflow_event_inbox WHERE delivery_id='old'").get()?.sent_at,older);
    const diagnostic=f.db.sqlite.prepare('SELECT message,detail_r2_key FROM workflow_errors').get()!;
    assert.equal(diagnostic.message,'provider send unavailable');
    assert.match(await (await f.bucket.get(String(diagnostic.detail_r2_key)))!.text(),/upstream reset/);
  } finally {f.db.close();}
});
