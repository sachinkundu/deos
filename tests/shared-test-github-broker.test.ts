import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {sha256Hex} from '../src/implementation-hash.ts';
import {SharedTestGitHubBroker,purgeSharedTestGitHubSessions,sharedTestGitHubCallback} from
  '../src/shared-test-github-broker.ts';

function database():{db:DatabaseSync;binding:D1Database} {
  const db=new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE test_leases (
    lease_id TEXT PRIMARY KEY,run_id TEXT,attempt_id TEXT,state TEXT,fence INTEGER,
    repository TEXT,branch TEXT,pull_request_number INTEGER,candidate_commit TEXT);
    CREATE TABLE test_environment (site_id INTEGER PRIMARY KEY,state TEXT,
      owner_run_id TEXT,owner_lease_id TEXT,fence INTEGER,heartbeat_due_at TEXT);
    CREATE TABLE test_app_sessions (session_sha256 TEXT PRIMARY KEY,
      run_id TEXT,attempt_id TEXT,lease_id TEXT,fence INTEGER,origin TEXT,
      cookie_class TEXT,expires_at TEXT,revoked_at TEXT);`);
  db.exec(readFileSync(new URL('../migrations/0074_shared_test_github_auth.sql',
    import.meta.url),'utf8'));
  db.exec(readFileSync(new URL('../migrations/0075_shared_test_reviewer_sessions.sql',
    import.meta.url),'utf8'));
  db.exec('CREATE TABLE test_review_fixture_events(delivery_id TEXT PRIMARY KEY); CREATE TABLE test_browser_sessions(lease_id TEXT);');
  db.exec(readFileSync(new URL('../migrations/0081_shared_test_review_scenarios.sql',import.meta.url),'utf8'));
  db.exec(readFileSync(new URL('../migrations/0089_shared_test_reply_read_fault.sql',import.meta.url),'utf8'));
  const binding={
    prepare(sql:string) {return {bind(...args:unknown[]) {
      const statement=db.prepare(sql);
      return {
        first:async()=>statement.get(...args as never[])??null,
        run:async()=>({meta:{changes:Number(statement.run(...args as never[]).changes)}}),
      };
    }};},
    async batch(items:Array<{run:()=>Promise<unknown>}>) {
      db.exec('BEGIN');
      try {
        const result=[];
        for(const item of items)result.push(await item.run());
        db.exec('COMMIT');
        return result;
      } catch(error) {db.exec('ROLLBACK');throw error;}
    },
  } as unknown as D1Database;
  return {db,binding};
}

test('fixed callback returns to its lease and never gives the candidate a token',async()=>{
  const {db,binding}=database();
  const appSession='a'.repeat(43),origin=
    `https://bettaview-${'b'.repeat(32)}.apps.deos-test.voxdez.com`;
  const leaseId='b'.repeat(64),runId='run-1',attemptId='attempt-1';
  const now=Date.now();
  db.prepare(`INSERT INTO test_leases VALUES (?,?,?,?,?,?,?,?,?)`).run(
    leaseId,runId,attemptId,'active',1,'sachinkundu/deos',
    'deos/agent/SAC-182/run-1',137,'c'.repeat(40));
  db.prepare(`INSERT INTO test_environment VALUES (?,?,?,?,?,?)`).run(
    1,'active',runId,leaseId,1,new Date(now+60*60_000).toISOString());
  db.prepare(`INSERT INTO test_app_sessions VALUES (?,?,?,?,?,?,?,?,?)`).run(
    await sha256Hex(appSession),runId,attemptId,leaseId,1,origin,'browser',
    new Date(now+30*60_000).toISOString(),null);
  const calls:string[]=[];
  let currentHead='c'.repeat(40);
  const fetcher:typeof fetch=async(input,init)=>{
    const url=String(input);
    calls.push(url);
    if(url==='https://github.com/login/oauth/access_token') {
      const body=JSON.parse(String(init?.body));
      assert.equal(body.redirect_uri,sharedTestGitHubCallback);
      assert.ok(body.code_verifier);
      return Response.json({access_token:'ghu-test-private-token',expires_in:3600});
    }
    if(url==='https://api.github.com/user') {
      assert.equal((init?.headers as Record<string,string>).Authorization,
        'Bearer ghu-test-private-token');
      return Response.json({login:'reviewer',id:123});
    }
    if(url==='https://api.github.com/repos/sachinkundu/deos/pulls/137')
      return Response.json({state:'open',head:{sha:currentHead,
        ref:'deos/agent/SAC-182/run-1',repo:{full_name:'sachinkundu/deos'}}});
    if(url==='https://api.github.com/repos/sachinkundu/deos/pulls/137/reviews')
      return Response.json({id:300,commit_id:currentHead},{status:201});
    throw new Error(`unexpected provider request ${url}`);
  };
  const broker=new SharedTestGitHubBroker({DB:binding,
    TEST_MARKER_KEY_V1:'test-marker-key-with-at-least-thirty-two-bytes',
    GITHUB_API_URL:'https://api.github.com',
    SHARED_TEST_GITHUB_CLIENT_SECRET:'private-client-secret'} as never,fetcher);
  const authorization=await broker.start(appSession,origin,'/settings');
  const state=new URL(authorization).searchParams.get('state')!;
  assert.equal(new URL(authorization).searchParams.get('redirect_uri'),
    sharedTestGitHubCallback);
  const callback=await broker.callback(new Request(`${sharedTestGitHubCallback}?state=${state}&code=code-1`));
  assert.equal(callback.status,303);
  const destination=new URL(callback.headers.get('Location')!);
  assert.equal(destination.origin,origin);
  const handoff=destination.searchParams.get('handoff')!;
  const redeemed=await broker.redeem(appSession,origin,handoff);
  assert.equal(redeemed.returnTo,'/settings');
  const githubSession=redeemed.cookie.match(/__Host-deos_github=([^;]+)/)![1];
  assert.equal(await broker.authorized(appSession,githubSession,origin),true);
  const result=await broker.request({appSession,githubSession,origin,
    target:'https://api.github.com/user',method:'GET',body:null});
  assert.equal(result.status,200);
  assert.deepEqual(JSON.parse(result.body),{login:'reviewer',id:123});
  assert.deepEqual(calls,['https://github.com/login/oauth/access_token',
    'https://api.github.com/user']);
  const review={appSession,githubSession,origin,
    target:'https://api.github.com/repos/sachinkundu/deos/pulls/137/reviews',
    method:'POST',body:JSON.stringify({commit_id:'c'.repeat(40),event:'COMMENT',
      body:'Test review'})};
  const published=await broker.request(review);
  assert.equal(published.status,201);
  currentHead='d'.repeat(40);
  await assert.rejects(broker.request(review),/test_github_head_changed/);
  assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM test_github_transport_requests
    WHERE failure_json LIKE '%test_github_head_changed%'`).get()!.count,1);
  assert.equal(calls.filter(url=>url===review.target).length,1);
  assert.ok(db.prepare('SELECT token_ciphertext FROM test_github_sessions')
    .get()!.token_ciphertext);
  assert.equal(JSON.stringify(db.prepare('SELECT * FROM test_github_sessions').get())
    .includes('ghu-test-private-token'),false);
  await assert.rejects(broker.redeem(appSession,origin,handoff),
    /test_github_handoff_unavailable/);
  await assert.rejects(broker.callback(new Request(`${sharedTestGitHubCallback}?state=${state}&code=code-1`)),
    /test_github_oauth_state_unavailable/);
  db.prepare('UPDATE test_environment SET fence=2 WHERE site_id=1').run();
  assert.equal(await broker.authorized(appSession,githubSession,origin),false);
  db.prepare("UPDATE test_environment SET state='quiescing' WHERE site_id=1").run();
  await purgeSharedTestGitHubSessions(binding,runId,leaseId);
  assert.equal(db.prepare('SELECT token_ciphertext FROM test_github_sessions')
    .get()!.token_ciphertext,'');
  assert.equal(db.prepare('SELECT token_ciphertext FROM test_github_oauth_states')
    .get()!.token_ciphertext,null);
});

test('saved reviewer session stays on its disposable fixture and stores no token',async()=>{
  const {db,binding}=database();
  db.exec(`CREATE TABLE shared_test_run_handoffs(source_run_id TEXT,target_run_id TEXT,state TEXT);
    CREATE TABLE implementation_test_profiles(run_id TEXT,adapter_binding TEXT,profile_json TEXT,profile_sha TEXT);
    CREATE TABLE test_review_fixtures(resource_id TEXT,run_id TEXT,attempt_id TEXT,
      kind TEXT,provider TEXT,status TEXT,metadata_json TEXT);`);
  const appSession='a'.repeat(43),leaseId='b'.repeat(64),origin=
    `https://bettaview-${leaseId.slice(0,32)}.apps.deos-test.voxdez.com`;
  const expires=new Date(Date.now()+3600_000).toISOString();
  db.prepare('INSERT INTO test_leases VALUES (?,?,?,?,?,?,?,?,?)').run(
    leaseId,'new-run','attempt','active',3,'owner/real-work','real-branch',137,'c'.repeat(40));
  db.prepare('INSERT INTO test_environment VALUES (?,?,?,?,?,?)').run(
    1,'active','new-run',leaseId,3,expires);
  db.prepare('INSERT INTO test_app_sessions VALUES (?,?,?,?,?,?,?,?,?)').run(
    await sha256Hex(appSession),'new-run','attempt',leaseId,3,origin,'browser',expires,null);
  db.prepare('INSERT INTO shared_test_run_handoffs VALUES (?,?,?)').run('old-run','new-run','dispatched');
  const profile={repository:'owner/test-fixtures',projectId:'test-project',teamId:'team',
    githubUserId:123,states:{review:'review',work:'work',merge:'merge',canceled:'canceled'}};
  const encoded=JSON.stringify(profile),digest=await sha256Hex(encoded);
  db.prepare('INSERT INTO implementation_test_profiles VALUES (?,?,?,?)').run(
    'old-run',`github-linear-review-v1@${digest}`,encoded,digest);
  const fixture={profile,branch:'deos/canary/attempt',head:'d'.repeat(40),pullNumber:9};
  db.prepare('INSERT INTO test_review_fixtures VALUES (?,?,?,?,?,?,?)').run(
    'fixture','new-run','attempt','safe_test','github-linear-review-v1','ready',JSON.stringify(fixture));
  let reviewerId=123;
  const calls:string[]=[];
  const broker=new SharedTestGitHubBroker({DB:binding,GITHUB_API_URL:'https://api.github.com',
    IMPLEMENTATION_TEST_GITHUB_TOKEN:'already-configured-reviewer'} as never,async(input,init)=>{
    const url=String(input);calls.push(url);
    assert.equal((init?.headers as Record<string,string>).Authorization,'Bearer already-configured-reviewer');
    if(url==='https://api.github.com/user')return Response.json({id:reviewerId,type:'User'});
    if(url==='https://api.github.com/repos/owner/test-fixtures/pulls/9')
      return Response.json({state:'open',head:{sha:fixture.head,ref:fixture.branch,
        repo:{full_name:profile.repository}}});
    if(url==='https://api.github.com/repos/owner/test-fixtures/pulls/9/comments')return Response.json([]);
    if(url==='https://api.github.com/repos/owner/test-fixtures/pulls/9/comments/1/replies')return Response.json({id:10},{status:201});
    if(url==='https://api.github.com/repos/owner/test-fixtures/pulls/9/reviews')
      return Response.json({id:4},{status:201});
    throw new Error(`unexpected:${url}`);
  });
  const login=await broker.reviewer(appSession,origin,'//untrusted.test');
  assert.equal(login.returnTo,'/');
  const githubSession=login.cookie.match(/__Host-deos_github=([^;]+)/)![1];
  const stored=db.prepare('SELECT * FROM test_github_sessions').get()!;
  assert.equal(stored.credential_source,'test_reviewer');
  assert.equal(stored.token_ciphertext,'');
  assert.equal(stored.token_nonce,'');
  assert.equal(JSON.stringify(stored).includes('already-configured-reviewer'),false);
  const request={appSession,githubSession,origin,method:'POST',
    target:'https://api.github.com/repos/owner/test-fixtures/pulls/9/reviews',
    body:JSON.stringify({commit_id:fixture.head,event:'APPROVE'})};
  assert.equal((await broker.request(request)).status,201);
  db.prepare("INSERT INTO test_review_scenarios VALUES (?,'s06','test-run','ready','now')").run(leaseId);
  db.prepare("INSERT INTO test_review_fault_injections VALUES ('reject',?,'s06','github_reject_review','armed',NULL,'now',NULL)").run(leaseId);
  assert.equal((await broker.request(request)).status,422);
  assert.equal(db.prepare("SELECT state FROM test_review_fault_injections WHERE injection_id='reject'").get()!.state,'consumed');
  await assert.rejects(broker.request({...request,
    target:'https://api.github.com/repos/owner/real-work/pulls/137/reviews'}),/repository_denied/);
  db.prepare("INSERT INTO test_review_fault_injections VALUES ('lost',?,'s06','github_drop_reply_response','armed',NULL,'now',NULL)").run(leaseId);
  db.prepare("INSERT INTO test_review_reply_read_faults (injection_id,state) VALUES ('lost','armed')").run();
  const listing={...request,method:'GET',body:null,target:'https://api.github.com/repos/owner/test-fixtures/pulls/9/comments'};
  assert.equal((await broker.request(listing)).status,200,'a normal pre-write read is unaffected');
  await assert.rejects(broker.request({...request,target:'https://api.github.com/repos/owner/test-fixtures/pulls/9/comments/1/replies',
    body:JSON.stringify({body:'A reply'})}),/real GitHub reply succeeded/);
  assert.equal((await broker.request(listing)).status,429);
  assert.equal((await broker.request(listing)).status,200,'the read fault is consumed once');
  assert.equal(calls.filter(url=>url.endsWith('/comments/1/replies')).length,1);
  assert.equal(db.prepare("SELECT provider_status FROM test_github_transport_requests WHERE path LIKE '%/replies'").get()!.provider_status,201);
  assert.match(String(db.prepare("SELECT failure_json FROM test_github_transport_requests WHERE failure_json LIKE '%Injected GitHub 429%'").get()!.failure_json),/synthetic/);
  db.prepare("UPDATE test_review_reply_read_faults SET state='armed'").run();
  db.prepare("UPDATE test_review_scenarios SET state='retired'").run();
  assert.equal((await broker.request(listing)).status,200,'a retired scenario cannot affect the next scenario');
  reviewerId=456;
  await assert.rejects(broker.request(request),/identity_changed/);
  assert.equal(calls.filter(url=>url===request.target).length,1);
  db.prepare("UPDATE test_review_fixtures SET status='destroyed'").run();
  await assert.rejects(broker.request(request),/fixture_unavailable/);
  db.prepare("UPDATE test_environment SET state='cleaning'").run();
  await purgeSharedTestGitHubSessions(binding,'new-run',leaseId);
  assert.ok(db.prepare('SELECT revoked_at FROM test_github_sessions').get()!.revoked_at);
});
