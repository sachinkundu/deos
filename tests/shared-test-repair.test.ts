import assert from 'node:assert/strict';
import test from 'node:test';
import {ImplementationTestDatabase,seedRun} from './helpers/implementation-fixture.ts';
import {SharedTestRepairStore} from '../src/shared-test-repair.ts';
import {SharedTestRepairController} from '../src/shared-test-repair-controller.ts';
import {routeTestPortal} from '../portal/test-environment/worker.ts';

function fixture() {
  const db=new ImplementationTestDatabase();
  seedRun(db,'run-1','issue-1');
  db.sqlite.prepare(`INSERT INTO test_lease_requests
    (request_id,run_id,node_visit,attempt_id,task_id,candidate_commit,patch_sha256,
     state,created_at,updated_at) VALUES
    ('request-1','run-1',1,'attempt-1','issue-1',?,?,'granted','now','now')`)
    .run('a'.repeat(40),'b'.repeat(64));
  db.sqlite.prepare(`INSERT INTO test_leases
    (lease_id,request_id,run_id,attempt_id,task_id,task_key,task_title,team_id,
     stage,state,fence,base_manifest_id,base_traffic_revision,base_json,
     repository,branch,pull_request_number,candidate_commit,patch_sha256,created_at)
    VALUES ('lease-1','request-1','run-1','attempt-1','issue-1','SAC-1','Test',
      'team-1','shared_test_demo','cleaning',2,'manifest-1','traffic-1','{}',
      'owner/repo','codex/test',150,?,?,'now')`)
    .run('a'.repeat(40),'b'.repeat(64));
  db.sqlite.prepare(`UPDATE test_environment SET state='cleaning',
    owner_run_id='run-1',owner_lease_id='lease-1',fence=2 WHERE site_id=1`).run();
  db.sqlite.prepare(`INSERT INTO test_resources
    (resource_id,run_id,lease_id,create_fence,kind,plan_state,provider_key,
     work_id,created_at,updated_at)
    VALUES ('resource-1','run-1','lease-1',1,'test_worker','created',
      'worker-1','create-1','now','now')`).run();
  db.sqlite.prepare(`INSERT INTO test_failures
    (fault_id,run_id,lease_id,phase,safe_code,first_message,causes_json,
     context_json,occurred_at)
    VALUES ('fault-1','run-1','lease-1','cleaning','identity_changed',
      'Worker identity changed','null','{}','now')`).run();
  return {db,store:new SharedTestRepairStore(db as unknown as D1Database)};
}

test('named repair blocks one owner and retry resumes the saved phase',async()=>{
  const {db,store}=fixture();
  try {
    const {repairId,revision}=await store.block({runId:'run-1',
      leaseId:'lease-1',resourceId:'resource-1',faultId:'fault-1'});
    const blocked=db.sqlite.prepare(`SELECT state,revision,hold_reason
      FROM test_environment WHERE site_id=1`).get();
    assert.equal(blocked?.state,'blocked');
    assert.equal(blocked?.revision,revision);
    assert.equal(blocked?.hold_reason,`repair:${repairId}`);
    await assert.rejects(store.retry({repairId,expectedRevision:revision+1,
      operatorEmail:'operator@example.com'}),/test_repair_retry_stale_or_missing/);
    assert.equal(db.sqlite.prepare(`SELECT state FROM test_environment WHERE site_id=1`)
      .get()?.state,'blocked');
    await store.retry({repairId,expectedRevision:revision,
      operatorEmail:'operator@example.com'});
    assert.equal(db.sqlite.prepare(`SELECT state FROM test_environment WHERE site_id=1`)
      .get()?.state,'cleaning');
    assert.equal(db.sqlite.prepare(`SELECT state FROM test_leases WHERE lease_id='lease-1'`)
      .get()?.state,'cleaning');
    assert.equal((await store.pending(repairId))?.choice,'retry');
    const action=db.sqlite.prepare(`SELECT repair_id,resource_id,choice,
      expected_revision,operator_sha256 FROM test_repair_actions
      WHERE repair_id=?`).get(repairId);
    assert.equal(action?.resource_id,'resource-1');
    assert.equal(action?.choice,'retry');
    assert.equal(action?.expected_revision,revision);
    assert.match(String(action?.operator_sha256),/^[a-f0-9]{64}$/);
    assert.throws(()=>db.sqlite.prepare(`DELETE FROM test_repair_actions
      WHERE repair_id=?`).run(repairId),/test_repair_action_immutable/);
    await assert.rejects(store.retry({repairId,expectedRevision:revision,
      operatorEmail:'operator@example.com'}),/test_repair_retry_stale_or_missing/);
    assert.equal(db.sqlite.prepare(`SELECT plan_state FROM test_resources
      WHERE resource_id='resource-1'`).get()?.plan_state,'created');
  }finally{db.close();}
});

test('repair cannot block an absent or foreign item',async()=>{
  const {db,store}=fixture();
  try {
    db.sqlite.prepare(`UPDATE test_resources SET plan_state='absent'`).run();
    await assert.rejects(store.block({runId:'run-1',leaseId:'lease-1',
      resourceId:'resource-1',faultId:'fault-1'}),/test_repair_block_scope_invalid/);
    assert.equal(db.sqlite.prepare(`SELECT state FROM test_environment WHERE site_id=1`)
      .get()?.state,'cleaning');
  }finally{db.close();}
});

test('Access repair page checks CSRF and owner revision before scheduling retry',async()=>{
  const {db,store}=fixture();
  try {
    const {repairId,revision}=await store.block({runId:'run-1',
      leaseId:'lease-1',resourceId:'resource-1',faultId:'fault-1'});
    const authenticate=async()=>({email:'operator@example.com'});
    const env={DB:db as unknown as D1Database,
      PORTAL_ACCESS_TEAM_DOMAIN:'deos-voxdez.cloudflareaccess.com',
      PORTAL_ACCESS_AUD:'aud',ROUTE_ADMIN_ALLOWED_EMAIL:'operator@example.com',
      STAGE_RETRY_SECRET:'test-secret'} as unknown as Env;
    const controller=new SharedTestRepairController(env,
      authenticate as never,()=>new Date('2026-09-27T10:00:00Z'));
    const path=`/admin/test-environment/repairs/${repairId}`;
    const portal={...env,ARTIFACTS:{} as R2Bucket,
      ACCESS_TEAM_DOMAIN:'deos-voxdez.cloudflareaccess.com',
      ACCESS_AUD:'aud',ALLOWED_EMAIL:'operator@example.com',
      COORDINATOR:{fetch:(input:RequestInfo|URL,init?:RequestInit)=>
        controller.handle(new Request(input,init))} as Fetcher};
    const headers={'CF-Access-Jwt-Assertion':'valid-test-jwt'};
    const status=await routeTestPortal(new Request('https://deos-test.voxdez.com/',
      {headers}),portal,authenticate as never);
    assert.match(await status.text(),new RegExp(`repairs/${repairId}`));
    const page=await routeTestPortal(new Request(`https://deos-test.voxdez.com${path}`,
      {headers}),portal,authenticate as never);
    assert.equal(page.status,200);
    const html=await page.text();
    assert.match(html,/resource-1/);
    const csrf=html.match(/name="csrfToken"\s+value="([A-Za-z0-9_-]+)"/)?.[1];
    assert.ok(csrf);
    const post=(origin:string,expectedRevision=revision)=>routeTestPortal(
      new Request(`https://deos-test.voxdez.com${path}`,{
        method:'POST',headers:{...headers,Origin:origin,
          'Content-Type':'application/x-www-form-urlencoded'},
        body:new URLSearchParams({choice:'retry',expectedRevision:
          String(expectedRevision),csrfToken:csrf})}),portal,authenticate as never);
    assert.equal((await post('https://other.example')).status,403);
    assert.equal((await post('https://deos-test.voxdez.com',revision+1)).status,400);
    const forged=await controller.handle(new Request(
      `https://coordinator.example/internal/test-repairs/${repairId}`,{
        method:'POST',headers:{...headers,Origin:'https://deos-test.voxdez.com',
          'Content-Type':'application/json'},
        body:JSON.stringify({version:1,choice:'retry',expectedRevision:revision,
          csrfToken:'x'.repeat(43)})}));
    assert.equal(forged.status,403);
    assert.equal(db.sqlite.prepare(`SELECT state FROM test_environment WHERE site_id=1`)
      .get()?.state,'blocked');
    assert.equal((await post('https://deos-test.voxdez.com')).status,303);
    assert.equal(db.sqlite.prepare(`SELECT state FROM test_environment WHERE site_id=1`)
      .get()?.state,'cleaning');
  }finally{db.close();}
});

test('repair route rejects an operator without Access authorization',async()=>{
  const {db,store}=fixture();
  try {
    const {repairId}=await store.block({runId:'run-1',leaseId:'lease-1',
      resourceId:'resource-1',faultId:'fault-1'});
    const controller=new SharedTestRepairController({
      DB:db as unknown as D1Database,
      PORTAL_ACCESS_TEAM_DOMAIN:'deos-voxdez.cloudflareaccess.com',
      PORTAL_ACCESS_AUD:'aud',ROUTE_ADMIN_ALLOWED_EMAIL:'operator@example.com',
      STAGE_RETRY_SECRET:'test-secret'} as unknown as Env,
    (async()=>{throw new Error('forbidden');}) as never);
    const response=await controller.handle(new Request(
      `https://coordinator.example/internal/test-repairs/${repairId}`));
    assert.equal(response.status,401);
    assert.equal(db.sqlite.prepare(`SELECT state FROM test_environment WHERE site_id=1`)
      .get()?.state,'blocked');
  }finally{db.close();}
});
