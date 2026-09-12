import test from 'node:test';
import assert from 'node:assert/strict';
import { createReviewCycle, reduceReviewCycle, validateSources, validateRecheck, validateDispositions } from '../container/bounded-review.mjs';
const initial = () => createReviewCycle({ runId: 'run', phase: 'planning', attemptId: 'author', inputDigest: 'a'.repeat(64) });
const finding = { id: 'F1', summary: 'Missing behavior', location: 'spec.md:1' };
const result = { findings: [finding], searchDisposition: 'not_searched', sources: [] };
const discover = () => reduceReviewCycle(reduceReviewCycle(initial(), { type: 'invoke', slot: 'discovery', invocationId: 'child1', inputDigest: 'a'.repeat(64) }),
 { type: 'result', slot: 'discovery', invocationId: 'child1', inputDigest: 'a'.repeat(64), lifecycleVerified: true, result });
test('repair is consumed before its outcome and cannot be repeated after a crash', () => {
 const state = reduceReviewCycle(discover(), { type: 'repair_started' });
 assert.throws(() => reduceReviewCycle(state, { type: 'repair_started' }), /consumed/);
 const recheck = reduceReviewCycle(state, { type: 'invoke', slot: 'recheck', invocationId: 'child2', inputDigest: 'a'.repeat(64) });
 assert.equal(recheck.repair.started, true);
 assert.throws(() => reduceReviewCycle(recheck, { type: 'repair_finished', passed: true, candidateDigest: 'b'.repeat(64) }), /invalid repair/);
});
test('two failed discovery calls require reconciliation; recheck instead keeps all findings open', () => {
 for (const slot of ['discovery','recheck']) {
  let state = slot === 'discovery' ? initial() : reduceReviewCycle(discover(), { type: 'repair_started' });
  for (let n=0;n<2;n++) {
   const event = { type: 'invoke', slot, invocationId: `${slot}${n}`, inputDigest: 'a'.repeat(64), authenticatedContinuation: n>0 };
   if (n>0) assert.throws(() => reduceReviewCycle(state, {...event, authenticatedContinuation: false}), /authorization/);
   state = reduceReviewCycle(state,event);
   state = reduceReviewCycle(state,{type:'failure',slot,invocationId:event.invocationId,cause:{message:'original transport error',stack:'stack'}});
  }
  assert.equal(slot==='discovery' ? state.status : state.recheck.status, slot==='discovery' ? 'manual_reconciliation_required' : 'unavailable');
  if(slot==='recheck') assert.deepEqual(state.openIds,['F1']);
  assert.throws(()=>reduceReviewCycle(state,{type:'invoke',slot,invocationId:'third',inputDigest:'a'.repeat(64),authenticatedContinuation:true}));
 }
});
test('closed recheck cannot add findings and missing or malformed original ratings remain open', () => {
 const checked=validateRecheck({ratings:{new:'open',F1:'maybe'},sources:[],searchDisposition:'none_used'},[finding]);
 assert.deepEqual(checked.ratings,{F1:'open'});
 assert.deepEqual(checked.violations,['new']);
});
test('source declarations bind citations and reject unsafe links without invented provenance', () => {
 const url='https://developers.cloudflare.com/workers/';
 const source={id:'S1',title:'Workers',url,claimLocator:'F1',provenance:'captured',observedAt:'invented'};
 const output={sources:[source],searchDisposition:'sources_used'};
 assert.equal(validateSources(output,{F1:`See ${url}`})[0].provenance,'declared');
 for(const bad of ['javascript:alert(1)','https://user:pass@example.com','https://example.com/\n']) {
  assert.throws(()=>validateSources({...output,sources:[{...source,url:bad}]},{F1:bad}),/invalid_source_record/);
 }
 assert.throws(()=>validateSources(output,{F1:'No citation'}),/uncited_search_result/);
 assert.throws(()=>validateSources({...output,searchDisposition:'none_used'},{F1:url}));
});
test('concern dispositions cover exactly the immutable concern inventory',()=>{
 assert.throws(()=>validateDispositions([],[finding]),/incomplete/);
 assert.throws(()=>validateDispositions([{id:'other',disposition:'applied',response:'fixed'}],[finding]));
 assert.equal(validateDispositions([{id:'F1',disposition:'declined',response:'Reason given'}],[finding])[0].disposition,'declined');
});

test('no findings bypasses repair and recheck but never approves the work',()=>{
 let state=reduceReviewCycle(initial(),{type:'invoke',slot:'discovery',invocationId:'empty',inputDigest:'a'.repeat(64)});
 state=reduceReviewCycle(state,{type:'result',slot:'discovery',invocationId:'empty',inputDigest:'a'.repeat(64),lifecycleVerified:true,result:{findings:[],sources:[],searchDisposition:'not_searched'}});
 assert.equal(state.recheck.status,'not_required');
 assert.throws(()=>reduceReviewCycle(state,{type:'repair_started'}));
 assert.equal(state.reviewedHead,null);
});
test('a result without the observed lifecycle cannot consume a slot',()=>{
 const state=reduceReviewCycle(initial(),{type:'invoke',slot:'discovery',invocationId:'child',inputDigest:'a'.repeat(64)});
 assert.throws(()=>reduceReviewCycle(state,{type:'result',slot:'discovery',invocationId:'child',inputDigest:'a'.repeat(64),result}),/unobserved/);
 assert.equal(state.discovery.status,'running');
});
