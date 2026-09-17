import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
// @ts-expect-error Container module.
import { ImplementationOperations } from '../container/implementation-operations.mjs';
// @ts-expect-error Container module.
import { implementationRequestQueue } from '../container/implementation-browser-demo.mjs';
// @ts-expect-error Container module.
import { implementationRequest, waitImplementationOperation, implementationExitCode } from '../container/implementation-client.mjs';
// @ts-expect-error Container module.
import { command } from '../container/implementation-runtime.mjs';

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'deos-operations-'));
  const queue = implementationRequestQueue();
  const operations = new ImplementationOperations(directory, queue, new Date(Date.now() + 60_000).toISOString());
  await operations.initialize();
  return {directory, queue, operations, close: async () => { await operations.drain(); await rm(directory, {recursive:true,force:true}); }};
}

test('lost submit reply, duplicate submit and immediate status preserve one running demo and its results', async () => {
  const f = await fixture();
  let release!: () => void, calls = 0;
  const hold = new Promise<void>(r => release = r);
  const work = async (_request: unknown, {activity}: any) => {
    calls++; await activity({scenarioId:'add',stepIndex:2}); await hold;
    return {captures:[{imagePath:'/deos/implementation/browser-original.png'}]};
  };
  let drop = true;
  const server = createServer(async (req,res) => {
    const chunks: Buffer[] = []; for await (const c of req) chunks.push(c);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    const result = body.action === 'operation' ? f.operations.status(body.requestId) : await f.operations.submit(body,work);
    if (drop) { drop=false; req.socket.destroy(); } else res.end(JSON.stringify(result));
  });
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
  const port=(server.address() as {port:number}).port;
  const request={action:'demo',requestId:'first',scenarios:[{id:'add'}]};
  try {
    await assert.rejects(implementationRequest(JSON.stringify(request),port),/socket hang up/);
    const duplicate=await implementationRequest(JSON.stringify(request),port);
    const live=JSON.parse((await implementationRequest(JSON.stringify({action:'operation',requestId:'first'}),port)).text);
    assert.equal(live.state,'running');assert.equal(live.progress.scenarioId,'add');assert.equal(calls,1);
    assert.equal(implementationExitCode(200,live),75);
    release();
    const done=JSON.parse((await waitImplementationOperation(duplicate,port,5)).text);
    assert.equal(done.state,'completed');assert.equal(done.result.captures[0].imagePath,'/deos/implementation/browser-original.png');
    assert.equal((await f.operations.submit(request,work)).state,'completed');assert.equal(calls,1);
    await assert.rejects(f.operations.submit({...request,scenarios:[]},work),/different input/);
    const restored=new ImplementationOperations(f.directory,f.queue,new Date(Date.now()+60_000).toISOString());
    await restored.initialize();assert.deepEqual(restored.status('first').result,done.result);
  } finally { release();await new Promise<void>(r=>server.close(()=>r()));await f.close(); }
});

test('cancel removes queued demo work; active demo cannot be blindly canceled', async () => {
  const f=await fixture();let release!:()=>void, calls=0;
  const hold=new Promise<void>(r=>release=r);
  try {
    await f.operations.submit({action:'demo',requestId:'a'},async()=>{calls++;await hold;return {};});
    await f.operations.submit({action:'demo',requestId:'b'},async()=>{calls++;return {};});
    assert.equal((await f.operations.cancel('b')).state,'canceled');
    await assert.rejects(f.operations.cancel('a'),/in-flight browser action/);
    release();await f.operations.drain();assert.equal(calls,1);
  } finally {release();await f.close();}
});

test('dependency exit failure prevents a subsequent real command; explicit cancellation retains output', async () => {
  const f=await fixture();const marker=join(f.directory,'must-not-exist');
  const run=async (r:any,e:any)=>command(r.argv,f.directory,{signal:e.signal,onActivity:e.output});
  try {
    await f.operations.submit({action:'check',requestId:'install',argv:[process.execPath,'-e',"console.error('install failed');process.exit(7)"]},run);
    await f.operations.submit({action:'check',requestId:'test',dependsOn:['install'],argv:[process.execPath,'-e',`require('fs').writeFileSync(${JSON.stringify(marker)},'bad')`]},run);
    await f.operations.drain();
    assert.equal(implementationExitCode(200,f.operations.status('install')),7);
    assert.match(f.operations.status('install').result.stderr,/install failed/);
    assert.match(f.operations.status('test').error.message,/Dependency install is failed/);
    await assert.rejects(readFile(marker),{code:'ENOENT'});
    await f.operations.submit({action:'check',requestId:'long',argv:[process.execPath,'-e',"console.log('working');setInterval(()=>{},1000)"]},run);
    for(let i=0;i<100 && !f.operations.status('long').progress;i++)await new Promise(r=>setTimeout(r,10));
    assert.equal(f.operations.status('long').progress.event,'command_output');
    await f.operations.cancel('long');await f.operations.drain();
    const canceled=f.operations.status('long');assert.equal(canceled.state,'canceled');assert.match(canceled.error.result.stdout,/working/);
    assert.match(canceled.error.detail,/explicitly canceled/);
  } finally {await f.close();}
});

test('interrupted operation cannot silently replay after runtime restart', async () => {
  const f=await fixture();
  try {
    await writeFile(join(f.directory,'old.json'),JSON.stringify({requestId:'old',action:'demo',state:'running',lastActivityAt:new Date().toISOString()}));
    const restored=new ImplementationOperations(f.directory,f.queue,new Date(Date.now()+60_000).toISOString());await restored.initialize();
    assert.equal(restored.status('old').state,'interrupted');assert.match(restored.status('old').error.message,/restarted/);
    assert.equal(implementationExitCode(200,restored.status('old')),1);
  } finally {await f.close();}
});
