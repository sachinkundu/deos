import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import test from 'node:test';
import {ImplementationTestDatabase,ImplementationTestBucket,seedRun} from './helpers/implementation-fixture.ts';
// @ts-expect-error The production web Worker is JavaScript; exercise its real transport here.
import {publishContinuation} from '../portal/bettaview/worker/review-continuation.js';
import {canonicalJson,sha256Hex,signServiceAssertion,D1ReviewContinuationStore} from '../src/review-continuation.ts';

// Only the platform superclass is replaced; exercise the real RPC, signature
// checks, authority query, and durable diagnostic writes with SQLite and R2.
const hooks=registerHooks({resolve(specifier,context,next){
  if(specifier==='cloudflare:workers')return {shortCircuit:true,url:'data:text/javascript,'+
    encodeURIComponent('export class WorkerEntrypoint { constructor(ctx,env) { this.env=env; } }')};
  return next(specifier,context);
}});
const {ReviewContinuation}=await import('../src/review-continuation-entrypoint.ts');
hooks.deregister();

for(const invalid of ['signature','expired','identity','nonce','page_account','page_github','page_nested_account','page_nested_github'] as const)
test(`prepare ${invalid} rejection keeps its original diagnostic without allocating a review`,async()=>{
  const db=new ImplementationTestDatabase(),bucket=new ImplementationTestBucket();seedRun(db);
  try {
    db.sqlite.prepare(`INSERT INTO project_workflow_policies
      (project_id,definition_id,definition_version,definition_digest,trial_repository,start_state_name,
        human_gate_state_id,dispatch_enabled,updated_at,bettaview_continuation_enabled)
      VALUES ('project','implementation',25,?,'owner/repo','Todo','review',1,'now',1)`).run('d'.repeat(64));
    const initial={...db.sqlite.prepare("SELECT * FROM orchestration_runs WHERE run_id='run-1'").get(),
      frozen_access_account:'reviewer@example.test',frozen_github_user_id:7,
      frozen_linear_user_id:'linear-user',bettaview_account_policy_version:1};
    db.sqlite.exec("DELETE FROM orchestration_runs WHERE run_id='run-1'");
    db.sqlite.prepare(`INSERT INTO orchestration_runs (${Object.keys(initial).join(',')})
      VALUES (${Object.keys(initial).map(()=>'?').join(',')})`).run(...Object.values(initial));
    db.sqlite.prepare(`INSERT INTO human_gate_visits
      (run_id,visit_sequence,node_id,gate_kind,work_type,work_product_kind,round,state,repository,
        pull_request_database_id,pull_request_number,pull_request_url,head_branch,base_branch,approved_head_sha,created_at)
      VALUES ('run-1',1,'implementation_review','plan','proposal_and_specs','planning',1,'open','owner/repo',
        '9',9,'https://github.com/owner/repo/pull/9','candidate','main',?,'now')`).run('a'.repeat(40));
    const input={reviewId:crypto.randomUUID(),runId:'run-1',issueId:'issue-1',repository:'owner/repo',pullRequestNumber:9,
      headSha:'a'.repeat(40),gateVisitSequence:1,reviewType:'COMMENT' as const,accountPolicyVersion:1,items:[]};
    const assertion=await signServiceAssertion({method:'prepareReview',bodyDigest:await sha256Hex(canonicalJson(input)),
      accessAccount:'reviewer@example.test',githubUserId:invalid==='identity'?8:7,
      issuedAt:Date.now()-(invalid==='expired'?120_000:0),nonce:crypto.randomUUID()},
      invalid==='signature'?'x'.repeat(32):'s'.repeat(32));
    const rpc=new ReviewContinuation({} as ExecutionContext,
      {DB:db,ARTIFACTS:bucket,REVIEW_CONTINUATION_SECRET:'s'.repeat(32)} as never);
    if(invalid==='nonce')await new D1ReviewContinuationStore(db as unknown as D1Database).consumeNonce(assertion,new Date().toISOString());
    const page=invalid.startsWith('page_');
    const code=page?'page_identity_mismatch':invalid==='identity'?'identity_mismatch':invalid==='expired'?'expired_service_assertion':
      invalid==='nonce'?'replayed_service_assertion':'invalid_service_assertion';
    if(page) {
      const requests:string[]=[];
      const env={REVIEW_CONTINUATION_SECRET:'s'.repeat(32),DEOS_REVIEW_CONTINUATION:rpc,
        GITHUB_REQUEST:async(url:string)=>{requests.push(url);assert.equal(url,'https://api.github.com/user');
          return Response.json({id:7,login:'reviewer'});}};
      await assert.rejects(publishContinuation('test-session','reviewer@example.test',env,{
        reviewId:input.reviewId,prUrl:'https://github.com/owner/repo/pull/9',headSha:input.headSha,
        event:'COMMENT',comments:[],continuation:{...input,
          ...(invalid==='page_nested_account'?{accessAccount:'forged@example.test'}:{}),
          ...(invalid==='page_nested_github'?{githubUserId:8}:{})},
        ...(invalid==='page_account'?{accessAccount:'forged@example.test'}:{}),
        ...(invalid==='page_github'?{githubUserId:8}:{}),
        pageIdentityMismatch:false,
      }),/page_identity_mismatch/);
      assert.deepEqual(requests,['https://api.github.com/user']);
    } else await assert.rejects(rpc.prepareReview(assertion,input),new RegExp(code));
    for(const table of ['review_intents','review_attempts','review_parts','review_continuation_leases','provider_operations'])
      assert.equal(db.sqlite.prepare(`SELECT COUNT(*) n FROM ${table}`).get()?.n,0);
    const rows=db.sqlite.prepare('SELECT * FROM workflow_errors').all();
    assert.equal(rows.length,1);assert.equal(rows[0].message,code);assert.equal(rows[0].step_name,'review.prepare');
    const original=JSON.parse(await (await bucket.get(String(rows[0].detail_r2_key)))!.text());
    assert.equal(original.message,code);assert.match(original.stack,new RegExp(code));
    assert.equal(JSON.stringify(original).includes('s'.repeat(32)),false);
    assert.equal(JSON.stringify(original).includes('forged@example.test'),false);
  }finally{db.close();}
});
