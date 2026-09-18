// Run inside the built Linux image, with this repository mounted at /test.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {chromium} from '/deos/node_modules/playwright/index.mjs';
import {LocalImplementationBrowser} from '/test/container/implementation-local-browser.mjs';
import * as scripts from '/test/src/implementation-browser-evidence.ts';

const events=[];
const browser=new LocalImplementationBrowser({launch:options=>chromium.launch(options),scripts,record:async event=>{events.push(event);console.log(JSON.stringify(event));}});
let forbiddenRequests=0;
const forbidden=createServer((_request,response)=>{forbiddenRequests++;response.end('Must not be reached');});
await new Promise(resolve=>forbidden.listen(8790,'127.0.0.1',resolve));
const server=createServer((request,response)=>{
  if(request.url==='/bad'){response.writeHead(503);response.end('Unavailable');return;}
  if(request.url==='/two-hop'){response.writeHead(302,{Location:'/escape'});response.end();return;}
  if(request.url==='/escape'){response.writeHead(302,{Location:'http://127.0.0.1:8790/private'});response.end();return;}
  if(request.url==='/subresource'){response.end('<img src="http://127.0.0.1:8790/private"><iframe src="http://127.0.0.1:8790/private"></iframe>');return;}
  response.setHeader('Content-Type','text/html');
  response.end(`<!doctype html><title>Local browser regression</title><input id="name" value="Old"><button>Save</button><output>${''}</output>
    <script>const input=document.querySelector('input'),out=document.querySelector('output');
    out.textContent=localStorage.getItem('note')||'empty';input.oninput=()=>out.dataset.input=input.value;
    document.querySelector('button').onclick=()=>{localStorage.setItem('note',input.value);out.textContent=input.value;};</script>`);
});
await new Promise(resolve=>server.listen(8787,'127.0.0.1',resolve));
const origin='http://127.0.0.1:8787';
const call=input=>{console.log(JSON.stringify(input));return browser.command(origin,input);};
try {
  await call({operation:'reset',width:1280,height:900});
  await call({operation:'fill',selector:'#name',text:'Saved by local Chromium'});
  await call({operation:'click',selector:'button'});
  await call({operation:'navigate'});
  assert.match((await call({operation:'state'})).content,/Saved by local Chromium/);
  await call({operation:'fill',selector:'#name',text:''});
  assert.match((await call({operation:'state'})).content,/data-input=""/);
  await call({operation:'viewport',width:390,height:844});
  const capture=await call({operation:'screenshot'});assert.equal(capture.viewport.width,390);
  const processes=execFileSync('ps',['-eo','user,pid,ppid,args'],{encoding:'utf8'}).split('\n').filter(line=>line.includes('chrome-headless-shell'));
  assert.ok(processes.length>0 && processes.every(line=>line.startsWith('deos-br')), 'Every Chromium process must run as the separate browser user');
  await mkdir('/evidence',{recursive:true});await writeFile('/evidence/regression.png',Buffer.from(capture.imageBase64,'base64'));
  await call({operation:'reset',width:1280,height:900});
  assert.match((await call({operation:'state'})).content,/<output>empty<\/output>/);
  const measurements=await call({operation:'measure'});assert.equal(measurements.measurements.viewport.width,1280);
  await assert.rejects(call({operation:'navigate',url:'http://127.0.0.1:8790/private'}),/escaped/);
  await assert.rejects(call({operation:'navigate',url:'file:///etc/passwd'}),/escaped/);
  await assert.rejects(call({operation:'navigate',url:'/escape'}),/ERR_BLOCKED_BY_CLIENT/);
  assert.equal(forbiddenRequests,0,'Redirect must be blocked before any request reaches the supervisor port');
  await call({operation:'reset',width:1280,height:900});
  await assert.rejects(call({operation:'navigate',url:'/two-hop'}),/ERR_BLOCKED_BY_CLIENT/);
  assert.equal(forbiddenRequests,0,'Every redirect hop must be checked');
  await call({operation:'reset',width:1280,height:900,url:'/subresource'});
  assert.equal(forbiddenRequests,0,'Images and frames cannot reach the supervisor port');
  await call({operation:'navigate',url:'/bad'});
  await assert.rejects(call({operation:'screenshot'}),/successful document response/);
  await browser.close();await assert.rejects(call({operation:'state'}),/Local browser ended/);
  await writeFile('/evidence/regression.json',JSON.stringify({status:'passed',checks:['real click and fill','empty controlled input','reload persistence','mobile screenshot','fresh reset clears storage','live measurements','origin and file rejection','single and multi-hop redirect block','cross-origin images and frames blocked','503 capture rejection','no replay after close','separate browser OS user'],events,processes},null,2));
  console.log(JSON.stringify({status:'passed',events}));
} finally {
  try {await browser.close();} finally {await Promise.all([new Promise(resolve=>server.close(resolve)),new Promise(resolve=>forbidden.close(resolve))]);}
}
