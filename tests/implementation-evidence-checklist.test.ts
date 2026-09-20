import assert from 'node:assert/strict';
import test from 'node:test';
import {createEvidenceChecklist, updateEvidenceChecklist, evidenceChecklistProblems, requireEvidenceChecklist} from '../container/implementation-evidence-checklist.mjs';
// @ts-expect-error The trusted container runtime is JavaScript.
import {beginBrowserDemo, finishBrowserDemo} from '../container/implementation-browser-demo.mjs';
// @ts-expect-error The trusted container runtime is JavaScript.
import {selectReviewProof, selectedReviewProof} from '../container/implementation-runtime.mjs';
import {publishImplementationProof} from '../src/implementation-pr-proof.ts';
import type {ImplementationCandidate} from '../src/implementation-contract.ts';
import type {ImplementationStore, ImplementationRun} from '../src/implementation-store.ts';
import type {ImplementationGitHub} from '../src/implementation-github.ts';

const plan = {sha256:'a'.repeat(64),value:{scenarios:[{id:'main-flow',title:'Save, read and delete'},{id:'failed-actions',title:'Report read and delete failures'}]}};
const context = {attemptId:'author',treeSha:'b'.repeat(40),occurredAt:'2026-09-20T10:00:00Z'};
const images = Array.from({length:14}, (_, index)=>({id:`image-${index}`,kind:'browser_image'}));

test('the eleven-image main flow survives a three-image response, restart and final selection',()=>{
  let checklist = createEvidenceChecklist(plan)!;
  checklist = updateEvidenceChecklist(checklist,[{id:'main-flow',state:'complete',evidenceIds:images.slice(0,11).map(p=>p.id),reason:'Save, read, refresh and delete are shown.'}],images,context);
  const state = {proof:images.slice(0,11),reviewProofIds:images.slice(0,11).map(p=>p.id),evidenceChecklist:checklist};
  beginBrowserDemo(state);
  finishBrowserDemo(state,{collectionId:'response',captures:images.slice(11).map((proof,stepIndex)=>({proof,scenarioId:'failed-actions',stepIndex}))});
  selectReviewProof(state,images.slice(11).map(p=>p.id));
  checklist = updateEvidenceChecklist(checklist,[{id:'failed-actions',state:'complete',evidenceIds:images.slice(11).map(p=>p.id),reason:'Read and delete errors are visible; the healthy snippet remains.'}],state.proof,{...context,attemptId:'response'});
  const restored = createEvidenceChecklist(plan,JSON.parse(JSON.stringify(checklist)))!;
  assert.equal(selectedReviewProof(state).length,14);
  assert.deepEqual(evidenceChecklistProblems(restored,plan,selectedReviewProof(state)),[]);
  assert.equal(restored.history.length,2);
  assert.equal(restored.history[0].attemptId,'author');
  assert.equal(restored.history[1].attemptId,'response');
});

test('agents can share an image across scenarios or explain an inapplicable item; there is no quota',()=>{
  let checklist = createEvidenceChecklist(plan)!;
  checklist = updateEvidenceChecklist(checklist,plan.value.scenarios.map(item=>({id:item.id,state:'complete' as const,evidenceIds:['image-0'],reason:'Both outcomes are visible in the same screenshot.'})),images,context);
  assert.doesNotThrow(()=>requireEvidenceChecklist(checklist,plan,[images[0]]));
  checklist = updateEvidenceChecklist(checklist,[{id:'failed-actions',state:'not_applicable',evidenceIds:[],reason:'The later human clarification removes this action; reviewer must assess that scope claim.'}],images,context);
  assert.doesNotThrow(()=>requireEvidenceChecklist(checklist,plan,[images[0]]));
  assert.equal(checklist.history.length,3);
});

test('pending items, lost links, omitted items and stale plans fail the structural check',()=>{
  const pending = createEvidenceChecklist(plan)!;
  assert.throws(()=>requireEvidenceChecklist(pending,plan,images),/pending/);
  const complete = updateEvidenceChecklist(pending,plan.value.scenarios.map(item=>({id:item.id,state:'complete' as const,evidenceIds:['image-0'],reason:'Observed the result.'})),images,context);
  assert.throws(()=>requireEvidenceChecklist(complete,plan,images.slice(1)),/not selected publishable evidence/);
  assert.throws(()=>requireEvidenceChecklist({...complete,items:complete.items.slice(1)},plan,images),/every saved scenario/);
  assert.throws(()=>requireEvidenceChecklist({...complete,items:[complete.items[0],complete.items[0]]},plan,images),/every saved scenario/);
  assert.throws(()=>requireEvidenceChecklist(complete,{...plan,sha256:'changed'},images),/saved demo plan/);
  assert.throws(()=>updateEvidenceChecklist(complete,[{id:'made-up',state:'complete',evidenceIds:['image-0'],reason:'Trust me'}],images,context),/Invalid evidence checklist/);
  assert.throws(()=>updateEvidenceChecklist(complete,[{id:'main-flow',state:'complete',evidenceIds:[],reason:'No evidence'}],images,context),/complete needs evidence/);
  const changed = createEvidenceChecklist({...plan,sha256:'changed'},complete)!;
  assert.ok(changed.items.every(item=>item.state==='pending'));
  assert.equal(changed.history.length,complete.history.length,'old judgments remain in history');
});

test('publication rejects a missing checklist item before touching GitHub or artifacts',async()=>{
  const noCalls = new Proxy({}, {get:(_target,property)=>{throw new Error(`Unexpected external operation ${String(property)}`);}});
  const candidate = {evidenceChecklist:createEvidenceChecklist(plan),proof:images} as unknown as ImplementationCandidate;
  await assert.rejects(publishImplementationProof(noCalls as ImplementationGitHub,noCalls as ImplementationStore,{} as ImplementationRun,candidate,plan),/evidence is still pending/);
});
