import assert from 'node:assert/strict';
import test from 'node:test';
import {sharedTestEdgeWrapper} from '../src/shared-test-edge-wrapper.ts';

async function edge() {
  const source=sharedTestEdgeWrapper('portal').replace(
    /^import candidate from .*;\n/,
    `const candidate={fetch:async request=>Response.json({gate:request.headers.get('X-Deos-Test-Gate'),access:request.headers.get('CF-Access-Jwt-Assertion'),clientId:request.headers.get('CF-Access-Client-Id'),clientSecret:request.headers.get('CF-Access-Client-Secret'),cookie:request.headers.get('Cookie')})};\n`);
  return (await import(`data:text/javascript,${encodeURIComponent(source)}`)).default;
}

test('edge checks host and session before forwarding and strips credentials',async()=>{
  const worker=await edge();
  const calls:string[]=[];
  const env={TEST_CANONICAL_HOST:'portal-test.apps.deos-test.voxdez.com',
    TEST_APP_GATE:{
      redeem:async()=>{calls.push('redeem');return {cookie:'__Host-deos_test=fresh; Path=/; Secure; HttpOnly; SameSite=Lax'};},
      authorize:async()=>{calls.push('authorize');return true;},
    }};
  const origin='https://portal-test.apps.deos-test.voxdez.com';
  assert.equal((await worker.fetch(new Request('https://other.test/'),env)).status,421);
  assert.equal((await worker.fetch(new Request(origin+'/'),env)).status,401);
  const launched=await worker.fetch(new Request(origin+'/__deos/launch',{
    method:'POST',headers:{'CF-Access-Jwt-Assertion':'access','Origin':origin},
    body:JSON.stringify({code:'one-use-code'})}),env);
  assert.equal(launched.status,204);
  assert.match(launched.headers.get('Set-Cookie')??'',/__Host-deos_test=fresh/);
  const response=await worker.fetch(new Request(origin+'/',{headers:{
    'CF-Access-Jwt-Assertion':'access',
    'Cookie':'__Host-deos_test=fresh; app=other',
    'X-Deos-Test-Gate':'forged'}}),env);
  assert.deepEqual(await response.json(),{gate:'verified',access:null,
    clientId:null,clientSecret:null,cookie:'app=other'});
  assert.deepEqual(calls,['redeem','authorize']);
});

test('edge reports its own release metadata without forwarding credentials to candidate code',async()=>{
  const worker=await edge();
  const host='portal-test.apps.deos-test.voxdez.com';
  const response=await worker.fetch(new Request(
    `https://${host}/api/version`,{headers:{
      'CF-Access-Jwt-Assertion':'assertion',
      'CF-Access-Client-Id':'client-id',
      'CF-Access-Client-Secret':'client-secret',
    }}),{TEST_CANONICAL_HOST:host,PORTAL_SOURCE_SHA:'a'.repeat(40),
      PORTAL_BUILD_INPUT_SHA256:'b'.repeat(64),
      TEST_BASE_VERSION_ID:'11111111-1111-4111-8111-111111111111',
      CF_VERSION_METADATA:{id:'22222222-2222-4222-8222-222222222222'}});
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{canonicalHost:host,sourceSha:'a'.repeat(40),
    baseVersionId:'11111111-1111-4111-8111-111111111111',
    buildInputSha256:'b'.repeat(64),
    versionId:'22222222-2222-4222-8222-222222222222'});
});

test('edge rejects a forged gate header without the session',async()=>{
  const worker=await edge();
  const env={TEST_CANONICAL_HOST:'portal-test.apps.deos-test.voxdez.com',
    TEST_APP_GATE:{authorize:async()=>{throw new Error('must not call');}}};
  const response=await worker.fetch(new Request(
    'https://portal-test.apps.deos-test.voxdez.com/',{headers:{
      'CF-Access-Jwt-Assertion':'access','X-Deos-Test-Gate':'verified'}}),env);
  assert.equal(response.status,401);
});

test('edge module selection is fixed',()=>{
  assert.match(sharedTestEdgeWrapper('bettaview'),
    /import \{createBettaViewHandler\} from "\.\/app\/index\.js"/);
  assert.match(sharedTestEdgeWrapper('bettaview'),
    /export \{GitHubSession\} from '\.\/app\/index\.js'/);
  assert.throws(()=>sharedTestEdgeWrapper('staging'),/service_invalid/);
});

test('lease gate authorizes an older BettaView candidate through its auth seam',async()=>{
  const source=sharedTestEdgeWrapper('bettaview')
    .replace(/^import \{createBettaViewHandler\} from .*;\n/,
      `const createBettaViewHandler=authenticate=>({fetch:async request=>
        Response.json({identity:await authenticate(),gate:request.headers.get('X-Deos-Test-Gate')})});\n`)
    .replace("export {GitHubSession} from './app/index.js';",'');
  const worker=(await import(`data:text/javascript,${encodeURIComponent(source)}`)).default;
  const origin='https://bettaview-test.apps.deos-test.voxdez.com';
  const env={TEST_CANONICAL_HOST:new URL(origin).hostname,
    TEST_APP_GATE:{authorize:async()=>true},
    TEST_GITHUB_BROKER:{authorized:async()=>false}};
  assert.equal((await worker.fetch(new Request(origin+'/'),env)).status,401);
  const response=await worker.fetch(new Request(origin+'/',{headers:{
    'CF-Access-Jwt-Assertion':'access','Cookie':'__Host-deos_test=fresh'}}),env);
  assert.deepEqual(await response.json(),{identity:{email:'reviewer@deos-test.invalid'},
    gate:'verified'});
});

test('lease GitHub callback maps back to the saved app session',async()=>{
  const source=sharedTestEdgeWrapper('bettaview')
    .replace(/^import \{createBettaViewHandler\} from .*;\n/,
      `const createBettaViewHandler=()=>({fetch:async request=>
        Response.json({cookie:request.headers.get('Cookie')})});\n`)
    .replace("export {GitHubSession} from './app/index.js';",'');
  const worker=(await import(`data:text/javascript,${encodeURIComponent(source)}`)).default;
  const origin='https://bettaview-test.apps.deos-test.voxdez.com';
  const calls:string[]=[];
  const env={TEST_CANONICAL_HOST:new URL(origin).hostname,
    TEST_APP_GATE:{authorize:async()=>true},TEST_GITHUB_BROKER:{
      start:async(session:string,savedOrigin:string)=>{
        calls.push(`start:${session}:${savedOrigin}`);
        return 'https://github.com/login/oauth/authorize?state=one';},
      redeem:async(session:string,savedOrigin:string,handoff:string)=>{
        calls.push(`redeem:${session}:${savedOrigin}:${handoff}`);
        return {returnTo:'/settings',cookie:'__Host-deos_github=opaque; Path=/; Secure; HttpOnly'};},
      authorized:async()=>true,
    }};
  const headers={'CF-Access-Jwt-Assertion':'access','Cookie':'__Host-deos_test=fresh'};
  const started=await worker.fetch(new Request(origin+'/auth/github',{headers}),env);
  assert.equal(started.status,302);
  assert.match(started.headers.get('Location')??'',/github.com\/login\/oauth/);
  const completed=await worker.fetch(new Request(origin+'/__deos/github-complete?handoff=one',
    {headers}),env);
  assert.equal(completed.status,303);
  assert.equal(completed.headers.get('Location'),'/settings');
  assert.match(completed.headers.get('Set-Cookie')??'',/__Host-deos_github=opaque/);
  assert.deepEqual(calls,[`start:fresh:${origin}`,`redeem:fresh:${origin}:one`]);
  const app=await worker.fetch(new Request(origin+'/',{headers:{...headers,
    Cookie:'__Host-deos_test=fresh; __Host-deos_github=opaque; other=value'}}),env);
  assert.deepEqual(await app.json(),{cookie:'other=value'});
});

test('candidate review code uses a scoped transport without seeing the session',async()=>{
  const source=sharedTestEdgeWrapper('bettaview')
    .replace(/^import \{createBettaViewHandler\} from .*;\n/,
      `const createBettaViewHandler=()=>({fetch:async(request,env)=>{
        const credential=await env.GITHUB_TEST_SESSION(request);
        const provider=await env.GITHUB_REQUEST('https://api.github.com/user');
        let continuation;
        try {await env.TEST_REVIEW_CONTINUATION_CALL('status',{reviewId:'one'});}
        catch(error) {continuation=error.message;}
        return Response.json({credential,provider:await provider.json(),
          cookie:request.headers.get('Cookie'),rawBroker:env.TEST_GITHUB_BROKER,
          rawSessions:env.GITHUB_SESSIONS,
          continuation,continuationSecret:env.REVIEW_CONTINUATION_SECRET,
          liveContinuation:env.DEOS_REVIEW_CONTINUATION});
      }});\n`)
    .replace("export {GitHubSession} from './app/index.js';",'');
  const worker=(await import(`data:text/javascript,${encodeURIComponent(source)}`)).default;
  const origin='https://bettaview-test.apps.deos-test.voxdez.com';
  const env={TEST_CANONICAL_HOST:new URL(origin).hostname,
    REVIEW_CONTINUATION_SECRET:'production-secret',
    DEOS_REVIEW_CONTINUATION:{status:async()=>({live:true})},
    TEST_APP_GATE:{authorize:async()=>true},TEST_GITHUB_BROKER:{
      authorized:async(appSession:string,githubSession:string)=>{
        assert.equal(appSession,'app-secret');
        assert.equal(githubSession,'github-secret');
        return true;},
      request:async(input:{appSession:string;githubSession:string;target:string})=>{
        assert.equal(input.appSession,'app-secret');
        assert.equal(input.githubSession,'github-secret');
        assert.equal(input.target,'https://api.github.com/user');
        return {status:200,contentType:'application/json',body:'{"login":"reviewer"}'};},
    }};
  const response=await worker.fetch(new Request(origin+'/api/session',{headers:{
    'CF-Access-Jwt-Assertion':'access',
    Cookie:'__Host-deos_test=app-secret; __Host-deos_github=github-secret; other=value',
  }}),env);
  assert.deepEqual(await response.json(),{credential:'lease-session',
    provider:{login:'reviewer'},cookie:'other=value',
    continuation:'test_review_continuation_unavailable'});
});
