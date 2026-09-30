import assert from 'node:assert/strict';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {sha256Hex} from '../src/implementation-hash.ts';
import {SharedTestReviewProviderTransport} from '../src/shared-test-review-provider.ts';
import {sharedTestReviewAssertion,sharedTestReviewKey} from '../src/shared-test-review-signing.ts';
import {SharedTestReviewScenarios} from '../src/shared-test-review-scenarios.ts';
import {ImplementationTestBucket} from './helpers/implementation-fixture.ts';

test('review service transport only moves its live test issue and preserves failed scope reads',async()=>{
  const db=new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE test_environment(site_id INTEGER,state TEXT,fence INTEGER,
    owner_run_id TEXT,owner_lease_id TEXT,heartbeat_due_at TEXT);
    CREATE TABLE test_leases(lease_id TEXT PRIMARY KEY,run_id TEXT,attempt_id TEXT,state TEXT,fence INTEGER);
    CREATE TABLE orchestration_runs(run_id TEXT,allowed_linear_user_id TEXT);
    CREATE TABLE shared_test_run_handoffs(source_run_id TEXT,target_run_id TEXT,state TEXT);
    CREATE TABLE implementation_test_profiles(run_id TEXT,adapter_binding TEXT,profile_json TEXT,profile_sha TEXT);
    CREATE TABLE test_review_fixtures(resource_id TEXT PRIMARY KEY,run_id TEXT,attempt_id TEXT,
      kind TEXT,provider TEXT,status TEXT,metadata_json TEXT);
    CREATE TABLE test_proof_items(proof_id TEXT PRIMARY KEY,run_id TEXT,lease_id TEXT,
      phase TEXT,kind TEXT,classification TEXT,sanitizer_result TEXT,public_url TEXT,object_key TEXT);`);
  db.exec(readFileSync(new URL('../migrations/0076_shared_test_review_transport.sql',import.meta.url),'utf8'));
  db.exec('CREATE TABLE test_review_fixture_events(delivery_id TEXT PRIMARY KEY); CREATE TABLE test_browser_sessions(lease_id TEXT);');
  db.exec(readFileSync(new URL('../migrations/0081_shared_test_review_scenarios.sql',import.meta.url),'utf8'));
  db.exec(readFileSync(new URL('../migrations/0089_shared_test_reply_read_fault.sql',import.meta.url),'utf8'));
  db.exec(readFileSync(new URL('../migrations/0092_shared_test_scenario_handover.sql',import.meta.url),'utf8'));
  const leaseId='b'.repeat(64);
  const props={leaseId,runId:'run',attemptId:'attempt',fence:3};
  const profile={repository:'owner/fixtures',projectId:'project',teamId:'team',githubUserId:123,
    states:{review:'review',work:'work',merge:'merge',canceled:'canceled'}};
  const encoded=JSON.stringify(profile),digest=await sha256Hex(encoded);
  db.prepare('INSERT INTO implementation_test_profiles VALUES (?,?,?,?)').run(
    'run',`github-linear-review-v1@${digest}`,encoded,digest);
  db.prepare('INSERT INTO test_environment VALUES (?,?,?,?,?,?)').run(
    1,'active',3,'run',leaseId,new Date(Date.now()+3600_000).toISOString());
  db.prepare('INSERT INTO test_leases VALUES (?,?,?,?,?)').run(leaseId,'run','attempt','active',3);
  db.prepare('INSERT INTO orchestration_runs VALUES (?,?)').run('run','human');
  db.prepare('INSERT INTO test_review_fixtures VALUES (?,?,?,?,?,?,?)').run(
    'fixture','run','attempt','safe_test','github-linear-review-v1','ready',JSON.stringify({
      profile,branch:'deos/canary/attempt',head:'d'.repeat(40),pullNumber:9,issueId:'test-issue'}));
  const binding={batch:async(statements:{run:()=>Promise<unknown>}[])=>{
    db.exec('BEGIN');
    try {const result=[];for(const statement of statements)result.push(await statement.run());db.exec('COMMIT');return result;}
    catch(error){db.exec('ROLLBACK');throw error;}
  },prepare(sql:string){return{bind(...values:unknown[]){return{
    first:async()=>db.prepare(sql).get(...values as never[])??null,
    run:async()=>({meta:{changes:Number(db.prepare(sql).run(...values as never[]).changes)}}),
    all:async()=>({results:db.prepare(sql).all(...values as never[])}),
  };}};}} as unknown as D1Database;
  const env={DB:binding,ARTIFACTS:new ImplementationTestBucket(),LINEAR_API_URL:'https://api.linear.app/graphql',
    LINEAR_APP_ACCESS_TOKEN:'private-token',IMPLEMENTATION_TEST_GITHUB_TOKEN:'reviewer-token'} as unknown as Env;
  let team='team',writes=0,scopeReads=0,scopeStatus=200;
  const transport=new SharedTestReviewProviderTransport(env,props,async(input,init)=>{
    assert.equal(String(input),env.LINEAR_API_URL);
    assert.equal((init?.headers as Record<string,string>).Authorization,'Bearer private-token');
    const value=JSON.parse(String(init?.body));
    if(value.query.includes('LeaseReviewIssueScope')) {
      scopeReads++;
      if(scopeStatus!==200)return new Response('original upstream connection termination',{status:scopeStatus});
      return Response.json({data:{issue:{id:'test-issue',team:{id:team},project:{id:'project'}}}});
    }
    writes++;
    return Response.json({data:{issueUpdate:{success:true,issue:{id:'test-issue',state:{id:'work'}}}}});
  });
  const request=(id='test-issue',query=`mutation BettaViewReviewState($id: String!, $stateId: String!) {
    issueUpdate(id: $id, input: { stateId: $stateId }) { success issue { id state { id } } }
  }`)=>new Request(env.LINEAR_API_URL,{method:'POST',body:JSON.stringify({query,variables:{id,stateId:'work'}})});
  assert.equal((await transport.fetch(request())).status,200);
  assert.equal(writes,1);assert.equal(scopeReads,1);
  scopeStatus=503;
  const failedScope=await transport.fetch(request());
  assert.equal(failedScope.status,503);
  assert.match(await failedScope.text(),/before provider write/);
  assert.equal(writes,1);
  const originalScopeFault=db.prepare("SELECT failure_json FROM test_review_provider_requests WHERE failure_json LIKE '%original upstream%'").get();
  assert.match(String(originalScopeFault?.failure_json),/test_review_scope_read_failed:503:original upstream connection termination/);
  assert.match(String(originalScopeFault?.failure_json),/stack/);
  scopeStatus=200;
  db.prepare("INSERT INTO test_review_scenarios VALUES (?,'s08','test-run','ready','now')").run(leaseId);
  db.prepare("INSERT INTO test_review_fault_injections VALUES ('reject',?,'s08','linear_reject_move','armed',NULL,'now',NULL)").run(leaseId);
  assert.match(await (await transport.fetch(request())).text(),/Labeled test injection/);
  assert.equal(writes,1);
  await assert.rejects(transport.fetch(request('live-issue')),/move_scope_denied/);
  await assert.rejects(transport.fetch(request('test-issue','mutation { issueDelete(id:"live-issue") { success } }')),/query_denied/);
  team='different-team';
  await assert.rejects(transport.fetch(request()),/membership_changed/);
  assert.equal(writes,1);
  const fault=db.prepare("SELECT failure_json FROM test_review_provider_requests WHERE failure_json LIKE '%different-team%'").get()!;
  assert.match(String(fault.failure_json),/different-team/);
  assert.equal(String(fault.failure_json).includes('private-token'),false);
  const scenarios=new SharedTestReviewScenarios(env);
  for(const [id,lease,classification,result,url] of [
    ['pending',leaseId,'private','pending','https://unpublished.invalid'],
    ['published',leaseId,'public_safe','passed','https://proof.invalid/checked'],
    ['other-lease','other','public_safe','passed','https://proof.invalid/other'],
  ])db.prepare("INSERT INTO test_proof_items VALUES (?,'run',?,'first','app_screen',?,?,?,'private/raw.png')")
    .run(id,lease,classification,result,url);
  assert.deepEqual(JSON.parse(JSON.stringify(await scenarios.proofStatus(props))),[
    {proofId:'pending',kind:'app_screen',classification:'private',sanitizerResult:'pending',publicUrl:null},
    {proofId:'published',kind:'app_screen',classification:'public_safe',sanitizerResult:'passed',publicUrl:'https://proof.invalid/checked'},
  ]);
  let fixtureWrites=0;
  scenarios.control=async(_binding,method)=>{
    assert.equal(method,'check_prepare');
    throw new Error('test_review_scenario_unsettled');
  };
  scenarios.provider=async()=>{fixtureWrites++;throw new Error('unexpected fixture write');};
  await assert.rejects(scenarios.prepare(props,'s09'),/test_review_scenario_unsettled/);
  assert.equal(fixtureWrites,0);
  assert.equal(db.prepare("SELECT state FROM test_review_scenarios WHERE scenario_id='s08'").get()!.state,'ready');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM test_review_scenarios').get()!.n,1);
  // Exercise the successful guard path against the actual migrated schema.
  // A failed successor setup retains both its retry record and the old route.
  const controlCalls:string[]=[];
  let prepareFails=true;
  scenarios.control=async(_binding,method)=>{
    controlCalls.push(method);
    if(method==='check_prepare')return {ready:true};
    assert.equal(method,'prepare');
    if(prepareFails)throw new Error('original successor setup failure');
    return {runId:'next-run'};
  };
  scenarios.provider=async()=>{
    fixtureWrites++;
    assert.equal(db.prepare("SELECT scenario_id FROM test_review_scenarios WHERE state='ready'").get()!.scenario_id,'s08');
    assert.equal(db.prepare("SELECT scenario_id FROM test_review_scenarios WHERE state='preparing'").get()!.scenario_id,'s09');
    return {response:{}};
  };
  await assert.rejects(scenarios.prepare(props,'s09'),/original successor setup failure/);
  assert.equal(db.prepare("SELECT state FROM test_review_scenarios WHERE scenario_id='s08'").get()!.state,'ready');
  assert.equal(db.prepare("SELECT state FROM test_review_scenarios WHERE scenario_id='s09'").get()!.state,'preparing');
  assert.throws(()=>db.prepare("INSERT INTO test_review_scenarios VALUES (?,'s10',NULL,'preparing',NULL)").run(leaseId),/UNIQUE/);
  assert.throws(()=>db.prepare("INSERT INTO test_review_scenarios VALUES (?,'s10','other','ready','now')").run(leaseId),/UNIQUE/);
  const pending=await scenarios.handle({...props,actions:['test_review_fixture']} as never,
    {version:1,operation:'prepare',scenario:'s10'});
  assert.equal(pending.status,409);
  const pendingBody=await pending.json() as {scenario:string;recovery:string};
  assert.equal(pendingBody.scenario,'s09');
  assert.match(pendingBody.recovery,/exact scenario ID/);
  prepareFails=false;
  assert.deepEqual(await scenarios.prepare(props,'s09'),{runId:'next-run'});
  assert.deepEqual(controlCalls,['check_prepare','prepare','check_prepare','prepare']);
  assert.equal(fixtureWrites,4);
  assert.equal(db.prepare("SELECT state FROM test_review_scenarios WHERE scenario_id='s08'").get()!.state,'retired');
  assert.equal(db.prepare("SELECT scenario_run_id FROM test_review_scenarios WHERE state='ready'").get()!.scenario_run_id,'next-run');
  // A lost setup response must not turn into a fresh app review or erase the
  // uncertain operation. Retain the readback and use a bounded setup retry.
  db.exec('CREATE TABLE test_review_fixture_operations(operation_id TEXT PRIMARY KEY,resource_id TEXT,state TEXT)');
  const resetId='fixture:scenario-s05-initial-state';
  db.prepare('INSERT INTO test_review_fixture_operations VALUES (?,\'fixture\',\'uncertain\')').run(resetId);
  const setupCalls:string[]=[];
  let currentIssue='test-issue',currentState='merge',retryFails=false;
  scenarios.control=async(_binding,method)=>{assert.equal(method,'check_prepare');return {ready:true};};
  scenarios.provider=async(_binding,value)=>{
    setupCalls.push(String(value.operationId??value.operation));
    if(value.operation==='linear.read')return {response:{issue:{id:currentIssue,state:{id:currentState}}}};
    assert.equal(value.operation,'linear.move');
    assert.equal(value.issueId,'test-issue');assert.equal(value.stateId,'review');
    if(value.operationId==='scenario-s05-initial-state' || retryFails)
      throw new Error('provider_test_operation_uncertain');
    return {response:{}};
  };
  await scenarios.resetFixture(props,'s05');
  assert.deepEqual(setupCalls,['scenario-s05-initial-state','linear.read','scenario-s05-initial-state-retry-1']);
  assert.equal(db.prepare('SELECT state FROM test_review_fixture_operations WHERE operation_id=?').get(resetId)!.state,'uncertain');
  setupCalls.length=0;currentState='review';
  await scenarios.resetFixture(props,'s05');
  assert.deepEqual(setupCalls,['scenario-s05-initial-state','linear.read']);
  setupCalls.length=0;
  db.prepare("UPDATE test_review_fixture_operations SET state='started'").run();
  await assert.rejects(scenarios.resetFixture(props,'s05'),/operation_uncertain/);
  assert.deepEqual(setupCalls,['scenario-s05-initial-state']);
  db.prepare("UPDATE test_review_fixture_operations SET state='uncertain'").run();
  currentIssue='another-issue';
  await assert.rejects(scenarios.resetFixture(props,'s05'),/reset_issue_changed/);
  currentIssue='test-issue';currentState='canceled';
  await assert.rejects(scenarios.resetFixture(props,'s05'),/reset_unexpected_state/);
  currentState='merge';retryFails=true;setupCalls.length=0;
  for(const i of [1,2])db.prepare('INSERT INTO test_review_fixture_operations VALUES (?,\'fixture\',\'uncertain\')')
    .run(resetId+`-retry-${i}`);
  await assert.rejects(scenarios.resetFixture(props,'s05'),/retries_exhausted/);
  assert.equal(setupCalls.filter(x=>x.includes('initial-state')).length,3);
  const originalResetFailure=new Error('Linear isolated test HTTP 503: original connection termination');
  let recorded:unknown;
  scenarios.recordSetupFailure=async(_binding,scenario,error)=>{assert.equal(scenario,'s05');recorded=error;};
  scenarios.provider=async()=>{throw originalResetFailure;};
  await assert.rejects(scenarios.resetFixture(props,'s05'),error=>error===originalResetFailure);
  assert.equal(recorded,originalResetFailure);
  const claims={...props,actions:['test_review_fixture']} as never;
  const injection={version:1,operation:'inject',scenario:'s09',kind:'github_advance_after_reply'};
  const firstInjection=await scenarios.handle(claims,injection);
  assert.equal(firstInjection.status,200);
  const firstArmed=await firstInjection.json() as {injectionId:string;state:string;reused:boolean};
  assert.equal(firstArmed.state,'armed');assert.equal(firstArmed.reused,false);
  const repeatInjection=await scenarios.handle(claims,injection);
  assert.equal(repeatInjection.status,200);
  assert.deepEqual(await repeatInjection.json(),{...firstArmed,reused:true});
  assert.equal(db.prepare("SELECT COUNT(*) n FROM test_review_fault_injections WHERE kind='github_advance_after_reply'").get()!.n,1);
  for(const state of ['consumed','cleared']) {
    db.prepare('UPDATE test_review_fault_injections SET state=? WHERE injection_id=?').run(state,firstArmed.injectionId);
    const repeated=await scenarios.handle(claims,injection);
    assert.equal(repeated.status,200);
    assert.deepEqual(await repeated.json(),{...firstArmed,reused:true,state});
    assert.equal(db.prepare("SELECT COUNT(*) n FROM test_review_fault_injections WHERE kind='github_advance_after_reply'").get()!.n,1);
  }
  const lostReply={...injection,kind:'github_drop_reply_response',reconciliationRead:'rate_limited'};
  const firstReply=await (await scenarios.handle(claims,lostReply)).json() as {injectionId:string};
  const replayReply=await scenarios.handle(claims,lostReply);
  assert.equal(replayReply.status,200);
  assert.equal((await replayReply.json() as {injectionId:string}).injectionId,firstReply.injectionId);
  const changedMode=await scenarios.handle(claims,{...injection,kind:'github_drop_reply_response'});
  assert.equal(changedMode.status,409);
  assert.equal((await changedMode.json() as {error:string}).error,'test_review_injection_parameters_changed');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM test_review_reply_read_faults').get()!.n,1);
  const invalidKind=await scenarios.handle(claims,{...injection,kind:'not-a-fault'});
  assert.equal(invalidKind.status,400);
  assert.equal((await invalidKind.json() as {error:string}).error,'test_review_injection_invalid');
  db.prepare("UPDATE test_review_scenarios SET state='retired'").run();
  const response=await scenarios.handle({...props,actions:['test_review_fixture']} as never,
    {version:1,operation:'prepare',scenario:'s08'});
  assert.equal(response.status,409);
  assert.match(JSON.stringify(await response.json()),/unique suffix/);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM test_review_scenarios').get()!.n,2);
  db.prepare('UPDATE test_environment SET fence=4').run();
  await assert.rejects(transport.fetch(request()),/provider_fenced/);
  await assert.rejects(scenarios.proofStatus(props),/scenario_fenced/);
  assert.equal(scopeReads,4);
});

test('test service assertions bind the lease, identity, method, and canonical body',async()=>{
  const parent='secret-with-at-least-thirty-two-characters',lease='a'.repeat(64);
  const first=await sharedTestReviewKey(parent,lease,1);
  assert.notEqual(first,await sharedTestReviewKey(parent,lease,2));
  const signed=await sharedTestReviewAssertion(first,123,'prepareReview',{b:2,a:1});
  assert.equal(signed.bodyDigest,await sha256Hex('{"a":1,"b":2}'));
  assert.equal(signed.accessAccount,'reviewer@deos-test.invalid');
  assert.equal(signed.githubUserId,123);
  assert.match(signed.mac,/^[a-f0-9]{64}$/);
  await assert.rejects(sharedTestReviewAssertion(first,123,'deleteEverything',{}),/method_denied/);
});
