import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error The container runner is JavaScript.
import {collectBrowserDemo, beginBrowserDemo, finishBrowserDemo, implementationToolQueue} from '../container/implementation-browser-demo.mjs';

const scenario = (id: string, key: string) => ({id, steps: [
  {operation:'press',key}, {operation:'screenshot',caption:`Entered ${key}`},
]});

test('a complete frozen scenario list holds the queue against other demos and raw browser calls',async()=>{
  const calls: string[] = [], events: any[] = [];
  let display = '', release!: () => void;
  const paused = new Promise<void>(resolve => { release = resolve; });
  let entered!: () => void;
  const firstStep = new Promise<void>(resolve => { entered = resolve; });
  const browser = async (step: any) => {
    calls.push(`${step.operation}:${step.key ?? ''}`);
    if (step.operation === 'reset') display = '';
    if (step.key === '7') { entered(); await paused; }
    if (step.operation === 'press') display += step.key;
    return step.operation === 'screenshot' ? {proof:{id:step.captureId,kind:'browser_image',caption:step.caption},display} : {};
  };
  const request = {action:'demo',scenarios:[scenario('one','7'),scenario('two','5')]};
  const queue = implementationToolQueue();
  const first = queue.run(()=>collectBrowserDemo(request,{browser,record:async (event: any)=>events.push(event)}), (error: Error)=>{throw error;});
  await firstStep;
  // Neither caller mutation nor a competing request may alter this collection.
  request.scenarios[1].steps[0].key = '9';
  const raw = queue.run(()=>browser({operation:'press',key:'8'}), (error: Error)=>{throw error;});
  const second = queue.run(()=>collectBrowserDemo({action:'demo',scenarios:[scenario('three','2')]},
    {browser,record:async (event: any)=>events.push(event)}), (error: Error)=>{throw error;});
  assert.deepEqual(calls,['reset:','press:7']);
  release();
  const result = await first;
  await raw;
  const next = await second;
  await queue.drain();
  assert.deepEqual(calls,['reset:','press:7','screenshot:','reset:','press:5','screenshot:','press:8','reset:','press:2','screenshot:']);
  assert.deepEqual(result.captures.map((c: any)=>[c.scenarioId,c.display,c.proof.caption]),[['one','7','Entered 7'],['two','5','Entered 5']]);
  assert.equal(next.captures[0].display,'2');
  assert.equal(new Set([...result.captures,...next.captures].map(c=>c.proof.id)).size,3);
  assert.equal(events.filter(e=>e.event==='scenario_completed').length,3);
});

test('an action failure stops the collection, preserves its cause and partial captures, and exports none',async()=>{
  const state = {proof:[{id:'old',kind:'browser_image'},{id:'command',kind:'showboat'}]};
  const events: any[] = [], calls: string[] = [];
  const original = new Error('No element found for selector: .decimal');
  const request = {action:'demo',scenarios:[{id:'decimal',steps:[
    {operation:'screenshot',caption:'Initial state'}, {operation:'click',selector:'.decimal'},
    {operation:'screenshot',caption:'Decimal entered'},
  ]},scenario('never-started','3')]};
  beginBrowserDemo(state);
  const queue = implementationToolQueue();
  let failure: any;
  await queue.run(async()=>{
    const result = await collectBrowserDemo(request,{record:async(event: any)=>events.push(event),browser:async(step: any)=>{
      calls.push(step.operation);
      if (step.operation==='click') throw original;
      return step.operation==='screenshot' ? {proof:{id:'partial',kind:'browser_image'}} : {};
    }});
    finishBrowserDemo(state,result);
  }, (error: Error)=>{failure=error;});
  assert.deepEqual(calls,['reset','screenshot','click']);
  assert.equal(failure.cause,original);
  assert.match(failure.message,/decimal stopped at step 2: No element/);
  assert.match(events.at(-1).error,/No element found.*\.decimal/);
  assert.equal(events.at(-1).captures[0].proof.id,'partial');
  assert.deepEqual(state.proof,[{id:'command',kind:'showboat'}]);
  const retried = await queue.run(()=>collectBrowserDemo({action:'demo',scenarios:[scenario('corrected','1')]},
    {record:async()=>{},browser:async(step: any)=>step.operation==='screenshot'?{proof:{id:'new',kind:'browser_image'}}:{}}), (error: Error)=>{throw error;});
  finishBrowserDemo(state,retried);
  assert.deepEqual(state.proof.map(p=>p.id),['command','new']);
});

test('a scenario cannot change the harness, target, viewport or reset midway',async()=>{
  for (const step of [
    {operation:'viewport',width:320,height:640}, {operation:'reset'},
    {operation:'trace',enabled:true}, {operation:'click',selector:'button',target:'hosted'},
  ]) {
    await assert.rejects(collectBrowserDemo({scenarios:[{id:'one',steps:[step]}]}, {
      browser:async()=>assert.fail('Invalid plan must not touch the browser'),record:async()=>{},
    }),/Unsupported demo step/);
  }
});
