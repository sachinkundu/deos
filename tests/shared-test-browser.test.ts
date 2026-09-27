import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {ImplementationTestBucket,ImplementationTestDatabase} from './helpers/implementation-fixture.ts';
import {SharedTestAppLauncher} from '../src/shared-test-app-launcher.ts';
import {SharedTestAppSessionStore} from '../src/shared-test-app-session.ts';
import {SharedTestBrowser} from '../src/shared-test-browser.ts';
import {SharedTestBrowserStore} from '../src/shared-test-browser-store.ts';
import {SharedTestBrowserCleanup} from '../src/shared-test-browser-cleanup.ts';
import type {TestBrowserProvider} from '../src/shared-test-browser-provider.ts';
import {sharedTestServicePlans} from '../src/shared-test-service-plan.ts';
import {SharedTestRawProofStore} from '../src/shared-test-raw-proof.ts';
import {SharedTestImageSanitizer} from '../src/shared-test-image-sanitizer.ts';
import {routePublicProof} from '../portal/test-proof/worker.ts';

const leaseId='a'.repeat(64),runId='run-1',attemptId='attempt-1';
const base={revision:'traffic-1',services:[{serviceName:'portal',
  sourceCommit:'b'.repeat(40),deployVersion:'base-1',
  buildInputSha256:'c'.repeat(64),trafficPercent:100}]};
const plan=sharedTestServicePlans(leaseId,base)[0];
const origin=`https://${plan.canonicalHost}`;
const clientId='client-1';
const principal=createHash('sha256').update(`service:${clientId}`).digest('hex');
const scope={runId,attemptId,leaseId,fence:1,plan};

function fixture() {
  const db=new ImplementationTestDatabase();
  db.sqlite.prepare(`INSERT INTO test_lease_requests
    (request_id,run_id,node_visit,attempt_id,task_id,candidate_commit,patch_sha256,
     state,created_at,updated_at)
    VALUES ('request-1',?,1,?,'issue-1',?,?,'granted','now','now')`)
    .run(runId,attemptId,'d'.repeat(40),'e'.repeat(64));
  db.sqlite.prepare(`INSERT INTO test_leases
    (lease_id,request_id,run_id,attempt_id,task_id,task_key,task_title,team_id,
     stage,state,fence,base_manifest_id,base_traffic_revision,base_json,
     repository,branch,pull_request_number,candidate_commit,patch_sha256,created_at)
    VALUES (?,'request-1',?,?,'issue-1','SAC-1','Test','team-1',
      'shared_test_demo','active',1,'manifest-1','traffic-1',?,
      'owner/repo','codex/test',150,?,?,'now')`)
    .run(leaseId,runId,attemptId,JSON.stringify(base),'d'.repeat(40),'e'.repeat(64));
  db.sqlite.prepare(`UPDATE test_environment SET state='active',owner_run_id=?,
    owner_lease_id=?,fence=1,heartbeat_due_at='9999-01-01T00:00:00Z'
    WHERE site_id=1`).run(runId,leaseId);
  db.sqlite.prepare(`INSERT INTO test_access_identities
    (identity_id,run_id,lease_id,resource_id,origin,audience,policy_id,
     principal_sha256,created_at) VALUES
    ('identity-1',?,?,?,?,'audience-1','policy-1',?,'now')`)
    .run(runId,leaseId,`test-access:${leaseId}:portal`,origin,principal);
  return db;
}

function launcher(db:ImplementationTestDatabase) {
  const fetcher:typeof fetch=async (_url,init)=>{
    const {code}=JSON.parse(String(init!.body));
    const session=await new SharedTestAppSessionStore(db as unknown as D1Database)
      .redeemCode(code,origin,principal);
    return new Response(null,{status:204,headers:{'Set-Cookie':session.cookie}});
  };
  return new SharedTestAppLauncher(db as unknown as D1Database,clientId,
    'secret-1',fetcher);
}

test('owned browser starts after trusted launch and rejects a later fence',async()=>{
  const db=fixture();
  try {
    const bucket=new ImplementationTestBucket();
    const image=new Uint8Array(128);
    image.set([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
    const sessions:string[]=[];
    let prepared=false,prepares=0,creates=0;
    const provider={
      inventory:async()=>[...sessions],
      capacity:async()=>({available:true,retryAfterMs:1000}),
      create:async(host:string)=>{
        assert.equal(host,plan.canonicalHost);
        creates++;sessions.push('browser-1');
        return {id:'browser-1',disconnect:async()=>{}};
      },
      prepare:async(_id:string,_origin:string,cookie:{httpOnly:boolean})=>{
        assert.equal(cookie.httpOnly,true);prepared=true;prepares++;
      },
      command:async()=>({url:origin,title:'Test',content:'<html>ready</html>'}),
      capture:async()=>({url:`${origin}/review`,image}),
      close:async(id:string)=>{sessions.splice(sessions.indexOf(id),1);},
    } as unknown as TestBrowserProvider;
    const browser=new SharedTestBrowser(new SharedTestBrowserStore(db as unknown as D1Database),
      provider,launcher(db),async()=>true);
    assert.equal((await browser.open(scope)).state,'ready');
    assert.equal(prepared,true);
    assert.equal((await browser.open(scope)).session_id,'browser-1');
    assert.equal(creates,1);
    assert.deepEqual(await browser.command(scope,{operation:'state'}),{
      url:origin,title:'Test',content:'<html>ready</html>'});
    db.sqlite.prepare(`UPDATE test_browser_sessions SET prepared_until=?
      WHERE lease_id=?`).run(new Date(Date.now()+30_000).toISOString(),leaseId);
    await browser.command(scope,{operation:'state'});
    assert.equal(prepares,2);
    assert.ok(Date.parse(String(db.sqlite.prepare(`SELECT prepared_until
      FROM test_browser_sessions WHERE lease_id=?`).get(leaseId)?.prepared_until))
      >Date.now()+12*60_000);
    const proofId=await new SharedTestRawProofStore(db as unknown as D1Database,
      bucket as unknown as R2Bucket).saveAppScreen(scope,await browser.capture(scope));
    const proof=db.sqlite.prepare(`SELECT classification,sanitizer_result,
      public_url,source_sha256,object_key FROM test_proof_items WHERE proof_id=?`)
      .get(proofId) as Record<string,unknown>;
    assert.equal(proof.classification,'private');
    assert.equal(proof.sanitizer_result,'pending');
    assert.equal(proof.public_url,null);
    assert.ok(bucket.objects.has(String(proof.object_key)));
    const proofUrl=`https://deos-shared-test-proof.skundu.workers.dev/proof/${proofId}`;
    const publicEnv={DB:db as unknown as D1Database,
      ARTIFACTS:bucket as unknown as R2Bucket};
    assert.equal((await routePublicProof(new Request(proofUrl),publicEnv)).status,404);
    const safeImage=new Uint8Array(image);safeImage[100]=1;
    const publicSha=createHash('sha256').update(safeImage).digest('hex');
    const recipe={version:1 as const,sourceSha256:String(proof.source_sha256),
      width:600,height:400,crop:{x:0,y:0,width:600,height:400},masks:[],
      allowedText:['SAC-182'],requiredText:['SAC-182']};
    const projector=new SharedTestImageSanitizer(db as unknown as D1Database,
      bucket as unknown as R2Bucket,{run:async()=>({image:safeImage,
        manifest:{version:1,sanitizerVersion:'fixed-mask-ocr-v1',
          sourceSha256:String(proof.source_sha256),publicSha256:publicSha,
          width:600,height:400,recognizedText:['SAC-182'],passed:true}})});
    const publicUrl=await projector.project(proofId,recipe);
    assert.equal(publicUrl,proofUrl);
    const projected=db.sqlite.prepare(`SELECT classification,read_at,projected_at
      FROM test_proof_items WHERE proof_id=?`).get(proofId);
    assert.equal(projected?.classification,'public_safe');
    assert.equal(projected?.read_at,null);
    assert.ok(projected?.projected_at);
    const page=await routePublicProof(new Request(publicUrl),publicEnv);
    assert.equal(page.status,200);
    assert.deepEqual(new Uint8Array(await page.arrayBuffer()),safeImage);
    const publicKey=`shared-test/public/${leaseId}/${proofId}.png`;
    bucket.objects.set(publicKey,new Uint8Array(image));
    assert.equal((await routePublicProof(new Request(publicUrl),publicEnv)).status,503);
    db.sqlite.prepare(`UPDATE test_environment SET state='quiescing',fence=2
      WHERE site_id=1`).run();
    await assert.rejects(browser.command(scope,{operation:'state'}),/shared_test_write_fenced/);
    await new SharedTestBrowserCleanup(new SharedTestBrowserStore(db as unknown as D1Database),
      provider).resume(leaseId,runId);
    assert.equal((await new SharedTestBrowserStore(db as unknown as D1Database)
      .row(leaseId,'portal'))?.state,'absent');
  }finally{db.close();}
});

test('unknown browser create outcome is retained and never retried as new',async()=>{
  const db=fixture();
  try {
    let creates=0;
    const provider={
      inventory:async()=>[],capacity:async()=>({available:true,retryAfterMs:1000}),
      create:async()=>{creates++;throw new Error('socket lost after create');},
    } as unknown as TestBrowserProvider;
    const browser=new SharedTestBrowser(new SharedTestBrowserStore(db as unknown as D1Database),
      provider,launcher(db),async()=>true);
    await assert.rejects(browser.open(scope),/provider_create_failed/);
    assert.equal((await new SharedTestBrowserStore(db as unknown as D1Database)
      .row(leaseId,'portal'))?.state,'creating');
    await assert.rejects(browser.open(scope),/create_outcome_uncertain/);
    assert.equal(creates,1);
    const cleanup=new SharedTestBrowserCleanup(new SharedTestBrowserStore(db as unknown as D1Database),
      provider);
    await assert.rejects(cleanup.resume(leaseId,runId),/create_outcome_pending/);
    await cleanup.resume(leaseId,runId,new Date(Date.now()+11*60_000));
    assert.equal((await new SharedTestBrowserStore(db as unknown as D1Database)
      .row(leaseId,'portal'))?.state,'absent');
  }finally{db.close();}
});

test('Linear screenshot storage is tied to the saved issue and remains private until sanitized',async()=>{
  const db=fixture(),bucket=new ImplementationTestBucket();
  try {
    const image=new Uint8Array(128);
    image.set([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
    const store=new SharedTestRawProofStore(db as unknown as D1Database,
      bucket as unknown as R2Bucket);
    await assert.rejects(store.saveLinearScreen(runId,leaseId,{image,
      url:'https://linear.app/sachinkundu/issue/SAC-2/wrong'}),
    /test_linear_screen_capture_invalid/);
    const proofId=await store.saveLinearScreen(runId,leaseId,{image,
      url:'https://linear.app/sachinkundu/issue/SAC-1/test'});
    const row=db.sqlite.prepare(`SELECT classification,source_sha256,public_url
      FROM test_proof_items WHERE proof_id=?`).get(proofId);
    assert.equal(row?.classification,'private');
    assert.equal(row?.public_url,null);
    const safeImage=new Uint8Array(image);safeImage[100]=1;
    const safeHash=createHash('sha256').update(safeImage).digest('hex');
    await new SharedTestImageSanitizer(db as unknown as D1Database,
      bucket as unknown as R2Bucket,{run:async()=>({image:safeImage,
        manifest:{version:1,sanitizerVersion:'fixed-mask-ocr-v1',
          sourceSha256:String(row?.source_sha256),publicSha256:safeHash,
          width:600,height:400,recognizedText:['SAC-1'],passed:true}})})
      .project(proofId,{version:1,sourceSha256:String(row?.source_sha256),
        width:600,height:400,crop:{x:0,y:0,width:600,height:400},masks:[],
        allowedText:['SAC-1'],requiredText:['SAC-1']});
    const response=await routePublicProof(new Request(
      `https://deos-shared-test-proof.skundu.workers.dev/proof/${proofId}`),{
      DB:db as unknown as D1Database,
      ARTIFACTS:bucket as unknown as R2Bucket});
    assert.equal(response.status,200);
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()),safeImage);
  }finally{db.close();}
});
