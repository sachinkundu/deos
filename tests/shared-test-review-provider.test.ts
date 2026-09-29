import assert from 'node:assert/strict';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {sha256Hex} from '../src/implementation-hash.ts';
import {SharedTestReviewProviderTransport} from '../src/shared-test-review-provider.ts';
import {sharedTestReviewAssertion,sharedTestReviewKey} from '../src/shared-test-review-signing.ts';

test('review service transport only moves its live test issue and preserves failed scope reads',async()=>{
  const db=new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE test_environment(site_id INTEGER,state TEXT,fence INTEGER,
    owner_run_id TEXT,owner_lease_id TEXT,heartbeat_due_at TEXT);
    CREATE TABLE test_leases(lease_id TEXT PRIMARY KEY,run_id TEXT,attempt_id TEXT,state TEXT,fence INTEGER);
    CREATE TABLE orchestration_runs(run_id TEXT,allowed_linear_user_id TEXT);
    CREATE TABLE shared_test_run_handoffs(source_run_id TEXT,target_run_id TEXT,state TEXT);
    CREATE TABLE implementation_test_profiles(run_id TEXT,adapter_binding TEXT,profile_json TEXT,profile_sha TEXT);
    CREATE TABLE test_review_fixtures(resource_id TEXT PRIMARY KEY,run_id TEXT,attempt_id TEXT,
      kind TEXT,provider TEXT,status TEXT,metadata_json TEXT);`);
  db.exec(readFileSync(new URL('../migrations/0076_shared_test_review_transport.sql',import.meta.url),'utf8'));
  db.exec('CREATE TABLE test_review_fixture_events(delivery_id TEXT PRIMARY KEY); CREATE TABLE test_browser_sessions(lease_id TEXT);');
  db.exec(readFileSync(new URL('../migrations/0081_shared_test_review_scenarios.sql',import.meta.url),'utf8'));
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
  const binding={prepare(sql:string){return{bind(...values:unknown[]){return{
    first:async()=>db.prepare(sql).get(...values as never[])??null,
    run:async()=>({meta:{changes:Number(db.prepare(sql).run(...values as never[]).changes)}}),
  };}};}} as unknown as D1Database;
  const env={DB:binding,LINEAR_API_URL:'https://api.linear.app/graphql',
    LINEAR_APP_ACCESS_TOKEN:'private-token',IMPLEMENTATION_TEST_GITHUB_TOKEN:'reviewer-token'} as unknown as Env;
  let team='team',writes=0,scopeReads=0;
  const transport=new SharedTestReviewProviderTransport(env,props,async(input,init)=>{
    assert.equal(String(input),env.LINEAR_API_URL);
    assert.equal((init?.headers as Record<string,string>).Authorization,'Bearer private-token');
    const value=JSON.parse(String(init?.body));
    if(value.query.includes('LeaseReviewIssueScope')) {
      scopeReads++;
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
  db.prepare('UPDATE test_environment SET fence=4').run();
  await assert.rejects(transport.fetch(request()),/provider_fenced/);
  assert.equal(scopeReads,3);
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
