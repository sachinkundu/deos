import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,mkdir,readFile,writeFile,rm,symlink} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
// @ts-expect-error Container modules are JavaScript.
import {transitionTask,updateTask} from '../container/implementation-task.mjs';
// @ts-expect-error Container modules are JavaScript.
import {previewTarget,checkedCommandArgv,proofSelectionSummary,progressSignalObservation,withPreviewTarget} from '../container/implementation-guidance.mjs';
// @ts-expect-error Container modules are JavaScript.
import {command,localConfig,selectReviewProof} from '../container/implementation-runtime.mjs';
// @ts-expect-error Container modules are JavaScript.
import {beginBrowserDemo,finishBrowserDemo} from '../container/implementation-browser-demo.mjs';

test('one real task transition at a time preserves content, fences and idempotent retries',async()=>{
  const root=await mkdtemp(join(tmpdir(),'reading-tasks-'));
  try {
    const folder=join(root,'openspec/changes/sample'); await mkdir(folder,{recursive:true});
    const path=join(folder,'tasks.md');
    const original='# Tasks\n- [ ] 1.1 First\n- [ ] 1.2 Second\n~~~md\n- [x] 1.1 Example\n~~~\n';
    await writeFile(path,original);
    const active=await updateTask(root,'sample',{action:'task',taskId:'1.1',state:'active'});
    assert.equal(active.completed,0);assert.equal(active.changed,false);
    const first=await updateTask(root,'sample',{action:'task',taskId:'1.1',state:'completed'});
    assert.equal(first.completed,1);assert.equal(first.total,2);
    assert.equal(await readFile(path,'utf8'),original.replace('- [ ] 1.1 First','- [x] 1.1 First'));
    const duplicate=await updateTask(root,'sample',{action:'task',taskId:'1.1',state:'completed'});
    assert.equal(duplicate.changed,false);assert.equal(duplicate.tasksSha,first.tasksSha);
    await assert.rejects(updateTask(root,'sample',{action:'task',taskId:'1.1',state:'active'}),/reopen/);
    assert.equal((await updateTask(root,'sample',{action:'task',taskId:'1.2',state:'completed'})).completed,2);
    assert.equal((await updateTask(root,'sample',{action:'task',taskId:'1.1',state:'pending'})).completed,1);
    assert.throws(()=>transitionTask(original,{action:'task',taskId:['1.1','1.2'],state:'completed'}),/task requires/);
    assert.throws(()=>transitionTask(original+'- [ ] 1.2 Duplicate\n',{action:'task',taskId:'1.2',state:'completed'}),/exactly one/);
    assert.throws(()=>transitionTask(original,{action:'task',taskId:'9.9',state:'completed'}),/found 0/);
    const outside=join(root,'outside.md');await writeFile(outside,'- [ ] 1.1 Secret');
    await rm(path);await symlink(outside,path);
    await assert.rejects(updateTask(root,'sample',{action:'task',taskId:'1.1',state:'completed'}));
    assert.equal(await readFile(outside,'utf8'),'- [ ] 1.1 Secret');
    await assert.rejects(updateTask(root,'../sample',{action:'task',taskId:'1.1',state:'completed'}),/Invalid task change/);
  } finally {await rm(root,{recursive:true,force:true});}
});

test('static preview defaults to hosted while backend and explicit local requests keep local D1/R2',()=>{
  const policy={safeAdapters:['static-preview-v1']};
  assert.equal(previewTarget({action:'preview',assets:'dist'},policy),'hosted');
  assert.equal(previewTarget({action:'preview',assets:'dist'},{safeAdapters:[]}),'local');
  for(const fields of [{main:'src/app.ts'},{d1:['DB']},{r2:['FILES']},{target:'local'}])
    assert.equal(previewTarget({action:'preview',assets:'dist',...fields},policy),'local');
  assert.throws(()=>previewTarget({target:'hosted',main:'src/app.ts'},policy),/cannot run/);
  assert.throws(()=>previewTarget({target:'other'},policy),/target/);
  const config=localConfig({action:'preview',main:'src/app.ts',assets:'dist',target:'local',d1:['DB'],r2:['FILES']},'attempt');
  assert.equal(config.d1_databases[0].database_id,'local-attempt-DB');
  assert.equal(config.r2_buckets[0].bucket_name,'test-attempt-files');
  assert.throws(()=>localConfig({action:'preview',assets:'.'},'attempt'),/dedicated/);
  assert.equal(withPreviewTarget({action:'browser',operation:'navigate'},'hosted').target,'hosted');
  assert.equal(withPreviewTarget({action:'browser',target:'local'},'hosted').target,'local');
  assert.deepEqual(withPreviewTarget({action:'demo',scenarios:[{id:'default'},{id:'explicit',target:'local'}]},'hosted').scenarios,
    [{id:'default',target:'hosted'},{id:'explicit',target:'local'}]);
});

test('a failed checked shell command or pipeline cannot be hidden by a later successful echo',async()=>{
  for(const script of ['echo original-error >&2; false; echo false-success','false | cat; echo false-success']) {
    const result=await command(checkedCommandArgv(['bash','-c',script]),process.cwd());
    assert.notEqual(result.exitCode,0);assert.doesNotMatch(result.stdout,/false-success/);
  }
  const recovery=await command(checkedCommandArgv(['bash','-c','if false; then exit 2; fi; echo handled']),process.cwd());
  assert.equal(recovery.exitCode,0);assert.match(recovery.stdout,/handled/);
  assert.deepEqual(checkedCommandArgv(['node','script.mjs']),['node','script.mjs']);
});

test('scenario selection map shows omitted captures without deciding coverage or losing original proof',()=>{
  const state={proof:[]};beginBrowserDemo(state);
  finishBrowserDemo(state,{collectionId:'c1',captures:[
    {scenarioId:'cycle',stepIndex:1,proof:{id:'before',kind:'browser_image',caption:'To read'}},
    {scenarioId:'cycle',stepIndex:3,proof:{id:'after',kind:'browser_image',caption:'Finished'}},
    {scenarioId:'empty-filter',stepIndex:1,proof:{id:'empty',kind:'browser_image',caption:'No finished books'}},
  ]});
  selectReviewProof(state,['after']);
  const summary=proofSelectionSummary(state);
  assert.equal(summary.length,2);
  assert.deepEqual(summary[0].captures.map((c:{selected:boolean})=>c.selected),[false,true]);
  assert.equal(summary[1].captures[0].selected,false);
  assert.equal(state.proof.length,3);
  selectReviewProof(state,[]);assert.equal(proofSelectionSummary(state)[0].captures[1].selected,false);
});

test('progress diagnostics distinguishes absent telemetry from unreadable or malformed telemetry',async()=>{
  const root=await mkdtemp(join(tmpdir(),'progress-observation-'));
  try {
    const path=join(root,'signal.json');assert.equal(await progressSignalObservation(path),null);
    await writeFile(path,'bad-json');await assert.rejects(progressSignalObservation(path),SyntaxError);
    await writeFile(path,JSON.stringify({outcome:'delivered',durationMs:15}));
    assert.deepEqual(await progressSignalObservation(path),{outcome:'delivered',durationMs:15});
  } finally {await rm(root,{recursive:true,force:true});}
});
