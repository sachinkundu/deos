// Deterministic fixture setup check against an explicit candidate checkout.
// This does not claim provider or deployed Workflow verification.
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,readFileSync,readdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {sharedTestReviewControlSource} from '../src/shared-test-review-control.ts';

const root=resolve(process.argv[2]);
const directory=mkdtempSync(join(tmpdir(),'review-control-check-'));
const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
for(const name of readdirSync(join(root,'migrations')).filter(n=>n.endsWith('.sql')).sort())
  sql.exec(readFileSync(join(root,'migrations',name),'utf8'));
const db={exec:async statement=>sql.exec(statement),prepare(text){
  let values=[];const statement=sql.prepare(text);
  return {bind(...args){values=args;return this;},first:async()=>statement.get(...values)??null,
    all:async()=>({results:statement.all(...values)}),
    run:async()=>({success:true,meta:{changes:Number(statement.run(...values).changes)}})};
},async batch(statements){sql.exec('BEGIN');try {
  const results=[];for(const statement of statements)results.push(await statement.run());
  sql.exec('COMMIT');return results;
}catch(error){sql.exec('ROLLBACK');throw error;}}};
const source=sharedTestReviewControlSource.replace(
  "import {D1OrchestrationStore,loadWorkflowDefinition} from './candidate-runtime.js';",
  `import {D1OrchestrationStore} from ${JSON.stringify(pathToFileURL(join(root,'src/orchestration-store.ts')).href)};\n`+
  `import {loadWorkflowDefinition} from ${JSON.stringify(pathToFileURL(join(root,'src/workflow-definition.ts')).href)};`);
const path=join(directory,'control.mjs');writeFileSync(path,source);
const {control}=await import(pathToFileURL(path));
const fixture={profile:{projectId:'project',teamId:'team',states:{review:'review',work:'work',merge:'merge',canceled:'canceled'}},
  scope:{repository:'owner/fixture',branch:'deos/canary/test',pullRequestNumber:9},
  issueId:'issue',issueUrl:'https://linear.app/test/issue/SAC-9/test',issueKey:'SAC-9',linearUserId:'linear-user',githubUserId:7};
const created=[],sent=[],objects=new Map();
const env={DB:db,TEST_REVIEW_FIXTURE:JSON.stringify(fixture),TEST_LEASE_ID:'a'.repeat(64),REVIEW_CONTINUATION_SECRET:'s'.repeat(48),
  REVIEW_PROVIDER_TRANSPORT:{assertActive:async()=>{}},
  ARTIFACTS:{put:async(k,v)=>objects.set(k,v),get:async k=>objects.has(k)?{text:async()=>objects.get(k)}:null},
  ORCHESTRATION_WORKFLOW:{create:async value=>created.push(value),get:async id=>({status:async()=>({status:'waiting'}),terminate:async()=>{},sendEvent:async e=>sent.push({id,...e})})}};
const request=async(method,payload={})=>{
  const raw=JSON.stringify({...payload,method,leaseId:env.TEST_LEASE_ID,at:Date.now(),nonce:crypto.randomUUID()});
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.REVIEW_CONTINUATION_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const sig=[...new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode('lease-test-control-v1:'+raw)))].map(x=>x.toString(16).padStart(2,'0')).join('');
  return control(new Request('https://test/__deos_test_control',{method:'POST',body:raw,headers:{'X-Deos-Test-Control':sig}}),env);
};
try {
  assert.equal((await control(new Request('https://test/',{method:'POST',body:'{}'}),env)).status,401);
  await request('bootstrap');
  const {D1BettaViewAccountStore}=await import(pathToFileURL(join(root,'src/review-continuation.ts')));
  await new D1BettaViewAccountStore(db).activate({projectId:'project',expectedRouteRevision:1,accessAccount:'reviewer@deos-test.invalid',githubUserId:7,linearUserId:'linear-user',linearAppActorId:'app',settingsActor:'reviewer@deos-test.invalid',providerEvidenceDigest:'b'.repeat(64),states:{humanReview:'review',inProgress:'work',merging:'merge'}},new Date().toISOString());
  const pull={id:9,number:9,state:'open',html_url:'https://github.com/owner/fixture/pull/9',base:{repo:{full_name:'owner/fixture'}},head:{ref:fixture.scope.branch,sha:'c'.repeat(40)}};
  const first=await (await request('prepare',{scenario:'s02',pull})).json();
  assert.equal(first.evidence.runs[0].frozen_github_user_id,7);
  assert.equal(first.evidence.runs[0].bettaview_account_policy_version,1);
  assert.equal(first.evidence.intents.length,0);
  assert.equal(first.evidence.transitions.length,0);
  assert.equal(created.length,1);
  await request('prepare',{scenario:'s02',pull});assert.equal(created.length,1);
  const stamp=new Date().toISOString();
  await request('delivery',{scenario:'s02',event:{deliveryId:'verified-delivery-fixture',issueId:'issue',payloadDigest:'d'.repeat(64),actorId:'app',actorType:'application',providerTime:stamp,receivedAt:stamp,fromStateId:'review',toStateId:'work'}});
  assert.equal(sent.length,1);
  const observed=await (await request('evidence',{scenario:'s02'})).json();
  assert.equal(observed.inbox[0].actor_type,'application');
  assert.equal(observed.intents.length,0);
  assert.equal(observed.transitions.length,0);
  const second=await (await request('prepare',{scenario:'s03',pull})).json();assert.equal(created.length,2);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM run_work_products').get().n,1);
  assert.equal(objects.size,1);
  const {D1ReviewContinuationStore}=await import(pathToFileURL(join(root,'src/review-continuation.ts')));
  const reviews=new D1ReviewContinuationStore(db),reviewId=crypto.randomUUID();
  await reviews.prepare({reviewId,runId:second.runId,issueId:'issue',repository:'owner/fixture',pullRequestNumber:9,
    headSha:pull.head.sha,gateVisitSequence:1,reviewType:'APPROVE',accountPolicyVersion:1,items:[]},
    'e'.repeat(64),{stateId:'merge',stateName:'Merging',edge:'trusted_merge'},stamp);
  await assert.rejects(reviews.prepare({reviewId,runId:second.runId,issueId:'issue',repository:'owner/fixture',pullRequestNumber:9,
    headSha:pull.head.sha,gateVisitSequence:1,reviewType:'COMMENT',accountPolicyVersion:1,items:[]},
    'f'.repeat(64),{stateId:'work',stateName:'In Progress',edge:'edit'},stamp),/id_clash/);
  const diagnostic=sql.prepare(`INSERT INTO workflow_errors
    (error_id,run_id,step_name,location,message,detail_r2_key,occurred_at)
    VALUES (?,?,'review.prepare','review.prepare',?,'private-error','now')`);
  diagnostic.run('safe-prepare',second.runId,'page_identity_mismatch');
  diagnostic.run('private-prepare',second.runId,'original provider message with private context');
  const clashEvidence=await (await request('evidence',{scenario:'s03'})).json();
  assert.deepEqual(clashEvidence.prepareFaults,[{
    error_id:'safe-prepare',public_code:'page_identity_mismatch',occurred_at:'now'}]);
  assert.deepEqual((await (await request('evidence',{scenario:'s02'})).json()).prepareFaults,[]);
  assert.equal(clashEvidence.idClashes.length,1);
  assert.deepEqual(Object.keys(clashEvidence.idClashes[0]).sort(),
    ['fault_id','public_code','receivedDigest','review_id','savedDigest']);
  assert.equal(clashEvidence.idClashes[0].savedDigest,'e'.repeat(64));
  assert.equal(clashEvidence.idClashes[0].receivedDigest,'f'.repeat(64));
  assert.equal(clashEvidence.intents[0].review_type,'APPROVE');
  assert.equal(clashEvidence.intents[0].bound_digest,'e'.repeat(64));
  assert.deepEqual((await (await request('evidence',{scenario:'s02'})).json()).idClashes,[]);
  sql.prepare("UPDATE review_intents SET github_status='done',linear_status='awaiting_delivery',linear_operation_id='test-operation',linear_delivery_deadline=? WHERE review_id=?").run(stamp,reviewId);
  await request('delivery',{scenario:'s03',event:{deliveryId:'matching-test-delivery',issueId:'issue',payloadDigest:'f'.repeat(64),actorId:'app',actorType:'application',providerTime:stamp,receivedAt:new Date().toISOString(),fromStateId:'review',toStateId:'merge'}});
  await reviews.expireLinearDelivery(reviewId,new Date().toISOString());
  assert.equal(sql.prepare('SELECT outcome FROM review_intents WHERE review_id=?').get(reviewId).outcome,'active');
  sql.prepare("DELETE FROM workflow_event_inbox WHERE delivery_id='matching-test-delivery'").run();
  await reviews.expireLinearDelivery(reviewId,new Date().toISOString());
  await reviews.expireLinearDelivery(reviewId,new Date().toISOString());
  assert.equal(sql.prepare('SELECT outcome FROM review_intents WHERE review_id=?').get(reviewId).outcome,'host_check_required');
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM review_ops_items').get().n,1);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM review_repairs').get().n,1);
  assert.equal(sql.prepare('SELECT released_at FROM review_continuation_leases WHERE review_id=?').get(reviewId).released_at,null);
  console.log('PASS: signed setup, actual candidate allocation/freeze, idempotence, retained scenario evidence, and event forwarding input. No provider proof claimed.');
} finally {sql.close();rmSync(directory,{recursive:true});}
