import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
// @ts-expect-error Container runtime is JavaScript.
import { LocalPreviewSession, implementationBrokerFetch } from '../container/implementation-runtime.mjs';

test('relay failure retains the serving local app and same configuration for recovery', async () => {
  const session = new LocalPreviewSession();
  const server = createServer((_request,response)=>response.end('app remains available'));
  let starts=0, connects=0, origin='';
  const firstError=new Error('Relay HTTP 530: error 1016');
  const dependencies={
    start:async()=>{
      starts++;
      await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
      origin=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
    },
    assertRunning:async()=>assert.equal(server.listening,true),
    connect:async()=>{if(++connects===1)throw firstError;return {origin:'https://same-relay.trycloudflare.com'};},
  };
  try {
    await assert.rejects(session.ensure({port:8787},dependencies),error=>error===firstError);
    assert.equal(await (await fetch(origin)).text(),'app remains available');
    assert.deepEqual(await session.ensure({port:8787},dependencies),{origin:'https://same-relay.trycloudflare.com'});
    assert.equal(starts,1);assert.equal(connects,2);
    await assert.rejects(session.ensure({port:9090},dependencies),/different settings/);
    assert.equal(starts,1);assert.equal(connects,2);
  } finally {await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

test('local startup failure is not mistaken for a retained healthy preview', async () => {
  const session=new LocalPreviewSession();
  const failure=new Error('workerd startup failed');
  await assert.rejects(session.ensure({port:8787},{start:async()=>{throw failure;},
    assertRunning:async()=>assert.fail('not started'),connect:async()=>assert.fail('not healthy')}),error=>error===failure);
  assert.equal(session.config,null);
});

test('lost broker response retains the socket cause and never replays an ambiguous click', async () => {
  let effects=0;
  const server=createServer((request)=>{request.resume();request.on('end',()=>{effects++;request.socket.destroy();});});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
  try {
    await assert.rejects(implementationBrokerFetch(url,{method:'POST',body:'click'}, {action:'browser',operation:'click'}),
      error=>error instanceof Error && /restart the saved demo from zero/.test(error.message) &&
        error.cause instanceof TypeError && (error.cause.cause as {code:string}).code==='UND_ERR_SOCKET');
    assert.equal(effects,1);
  } finally {await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
