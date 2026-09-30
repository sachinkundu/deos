import assert from 'node:assert/strict';
import test from 'node:test';
import {ImplementationTestDatabase,seedRun} from './helpers/implementation-fixture.ts';
import {SharedTestReviewRuntime} from '../src/shared-test-review-runtime.ts';
import {sha256Hex} from '../src/implementation-hash.ts';

test('candidate runtime uses lease stores, actual entrypoints, scoped service props, and proven cleanup',async()=>{
  const db=new ImplementationTestDatabase();seedRun(db);
  const leaseId='a'.repeat(64),commit='b'.repeat(40),suffix=leaseId.slice(0,32);
  const binding={runId:'run-1',attemptId:'demo-reserved',leaseId,fence:1};
  const bytes=new TextEncoder().encode('export class ReviewContinuation{}; export class DeosWorkflow{};');
  const digest=await sha256Hex(new TextDecoder().decode(bytes));
  const buildKey=`shared-test/review-runtimes/${commit}/${digest}.js`;
  const profile={repository:'owner/fixtures',projectId:'project',teamId:'team',githubUserId:7,
    states:{review:'review',work:'work',merge:'merge',canceled:'canceled'}};
  const profileJson=JSON.stringify(profile),profileSha=await sha256Hex(profileJson);
  db.sqlite.prepare('INSERT INTO implementation_test_profiles VALUES (?,?,?,?,?,?)').run(
    'run-1',`github-linear-review-v1@${profileSha}`,profileJson,profileSha,'now','operator');
  db.sqlite.prepare(`INSERT INTO test_lease_requests
    (request_id,run_id,node_visit,attempt_id,task_id,candidate_commit,patch_sha256,state,created_at,updated_at)
    VALUES ('request','run-1',1,'demo-reserved','issue-1',?,?,'granted','now','now')`).run(commit,'c'.repeat(64));
  db.sqlite.prepare(`INSERT INTO test_leases
    (lease_id,request_id,run_id,attempt_id,task_id,task_key,task_title,team_id,stage,state,fence,
     base_manifest_id,base_traffic_revision,base_json,repository,branch,pull_request_number,candidate_commit,patch_sha256,created_at)
    VALUES (?,'request','run-1','demo-reserved','issue-1','SAC-182','Review','team','shared_test_demo','active',1,
      'base','base','{}','owner/real','candidate',137,?,?,'now')`).run(leaseId,commit,'c'.repeat(64));
  db.sqlite.prepare(`UPDATE test_environment SET state='active',owner_run_id='run-1',owner_lease_id=?,
    fence=1,heartbeat_due_at=? WHERE site_id=1`).run(leaseId,new Date(Date.now()+3600_000).toISOString());
  for(const fence of [1,2])db.sqlite.prepare(`INSERT INTO test_lease_fence_epochs
    (lease_id,fence,run_id,reason,transition_revision,created_at) VALUES (?,?,'run-1','test',?,'now')`).run(leaseId,fence,fence);
  const resourceId='demo-reserved:safe_test';
  db.sqlite.prepare(`INSERT INTO test_review_fixtures
    (resource_id,run_id,attempt_id,lease_id,kind,slot_id,allocation_op,provider,provider_resource_id,
     status,metadata_json,created_at,updated_at)
    VALUES (?,'run-1','demo-reserved',?,'safe_test',?,?,'github-linear-review-v1','test-issue','ready',?,'now','now')`)
    .run(resourceId,leaseId,resourceId,`${resourceId}:allocate`,JSON.stringify({profile,
      branch:'deos/canary/demo-reserved',head:'d'.repeat(40),pullNumber:9,issueId:'test-issue',
      issueUrl:'https://linear.app/test/issue/SAC-9/test'}));
  db.sqlite.prepare("UPDATE orchestration_runs SET allowed_linear_user_id='reviewer' WHERE run_id='run-1'").run();
  for(const [kind,name,id] of [
    ['d1_database',`deos-test-portal-db-${suffix}`,'00000000-0000-4000-8000-000000000001'],
    ['r2_bucket',`deos-test-portal-artifacts-${suffix}`,`deos-test-portal-artifacts-${suffix}`]]) {
    db.sqlite.prepare(`INSERT INTO test_resources
      (resource_id,run_id,lease_id,create_fence,kind,plan_state,provider_key,remote_id,work_id,created_at,updated_at)
      VALUES (?,'run-1',?,1,?,'created',?,?,?,'now','now')`).run(kind,leaseId,kind,name,id,kind);
  }
  const workerName=`deos-test-review-${suffix}`,hostname=`review-${suffix}.apps.deos-test.voxdez.com`;
  let metadata:Record<string,any>|null=null,workflow=false,domain=false,uploads=0;
  const calls:string[]=[];
  const env={DB:db,ARTIFACTS:{
    list:async()=>({truncated:false,objects:[{key:buildKey}]}),
    get:async()=>({size:bytes.length,arrayBuffer:async()=>bytes.buffer}),
  },IMPLEMENTATION_ENVIRONMENT_ACCOUNT_ID:'1'.repeat(32),IMPLEMENTATION_ENVIRONMENT_TOKEN:'private-deploy-token',
    SHARED_TEST_ZONE_ID:'2'.repeat(32),TEST_MARKER_KEY_V1:'test-marker-key-at-least-thirty-two-characters',
    TEST_APP_SERVICE_CLIENT_ID:'access-id',TEST_APP_SERVICE_CLIENT_SECRET:'private-access-secret',
    GITHUB_API_URL:'https://api.github.com',LINEAR_API_URL:'https://api.linear.app/graphql',
    LINEAR_APP_ACTOR_ID:'app'} as unknown as Env;
  const runtime=new SharedTestReviewRuntime(env,async(input,init)=>{
    const url=new URL(String(input)),method=init?.method??'GET';
    if(url.hostname===hostname)return Response.json({sourceSha:commit,compiledSha256:digest,leaseId,versionId:'version-1'});
    const path=url.pathname.replace(/^\/client\/v4\/accounts\/[a-f0-9]{32}/,'');
    calls.push(`${method}:${path}`);
    let result:unknown={};
    if(path===`/workers/scripts/${workerName}/settings`) {
      if(!metadata)return new Response('absent',{status:404});
      result={tags:metadata.tags};
    } else if(path===`/workers/scripts/${workerName}` && method==='PUT') {
      uploads++;
      metadata=JSON.parse(String((init?.body as FormData).get('metadata')));
      assert.match(await ((init?.body as FormData).get('edge.js') as Blob).text(),/export \{ReviewContinuation,DeosWorkflow\}/);
    } else if(path===`/workers/scripts/${workerName}` && method==='DELETE') {
      metadata=null;return new Response(null,{status:204});
    } else if(path===`/workflows/${workerName}`) {
      if(method==='PUT')workflow=true;
      if(method==='DELETE'){workflow=false;return new Response(null,{status:204});}
      if(!workflow)return new Response('absent',{status:404});
      result={script_name:workerName,class_name:'DeosWorkflow',name:workerName,is_deleted:0};
    } else if(path==='/workers/domains') {
      if(method==='PUT')domain=true;
      result=domain?[{id:'domain',hostname,service:workerName,zone_id:'2'.repeat(32)}]:[];
    } else if(path==='/workers/domains/domain'&&method==='DELETE') {
      domain=false;return new Response(null,{status:204});
    } else throw new Error(`unexpected ${method} ${path}`);
    return Response.json({success:true,result});
  });
  try {
    await runtime.prepare({...binding,extra:'must not enter props'} as typeof binding);
    assert.ok(metadata);
    const bindings=(metadata as {bindings:Array<Record<string,unknown>>}).bindings;
    assert.deepEqual(bindings.find(item=>item.name==='REVIEW_PROVIDER_TRANSPORT'),{
      type:'service',name:'REVIEW_PROVIDER_TRANSPORT',service:'deos-queue-consumer-ts',
      entrypoint:'SharedTestReviewProvider',props:binding});
    assert.equal(bindings.some(item=>['GITHUB_APP_PRIVATE_KEY','IMPLEMENTATION_TEST_GITHUB_TOKEN',
      'IMPLEMENTATION_ENVIRONMENT_TOKEN'].includes(String(item.name))),false);
    assert.equal(bindings.find(item=>item.name==='LINEAR_APP_ACCESS_TOKEN')?.text,'lease-provider-proxy');
    assert.equal(db.sqlite.prepare('SELECT version_id FROM test_review_runtimes').get()?.version_id,'version-1');
    await runtime.prepare(binding);assert.equal(uploads,1);
    db.sqlite.prepare("UPDATE test_environment SET state='cleaning',fence=2").run();
    db.sqlite.prepare("UPDATE test_leases SET state='cleaning'").run();
    await runtime.cleanup({runId:'run-1',leaseId,cleanupFence:2});
    assert.ok(calls.indexOf(`DELETE:/workflows/${workerName}`)<calls.indexOf(`DELETE:/workers/scripts/${workerName}`));
    assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM test_resources WHERE kind LIKE 'review_runtime_%' AND plan_state='absent'").get()?.n,2);
    await runtime.cleanup({runId:'run-1',leaseId,cleanupFence:2});
    workflow=true;
    await assert.rejects(runtime.cleanup({runId:'run-1',leaseId,cleanupFence:2}),/workflow_reappeared/);
  } finally {db.close();}
});
