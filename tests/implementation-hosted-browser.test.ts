import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {ImplementationStore} from '../src/implementation-store.ts';
import {implementationPolicy} from '../src/implementation-contract.ts';
import {ImplementationTestDatabase,ImplementationTestBucket,seedRun,seedAttempt} from './helpers/implementation-fixture.ts';

test('hosted browser commands need no local tunnel and retain their session binding',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'hosted-browser-'));
  const db=new ImplementationTestDatabase(),bucket=new ImplementationTestBucket();
  seedRun(db);seedAttempt(db,'attempt');
  try {
    // Replace only provider I/O. Run the actual broker, allocator and D1 store.
    const browserModule=join(dir,'browser.ts');
    await writeFile(browserModule,`
      export {ImplementationBrowserAllocator,BrowserCapacityWait} from ${JSON.stringify(pathToFileURL(resolve('src/implementation-browser.ts')).href)};
      export const calls=[];
      export class CloudflareBrowserProvider {
        async inventory(){return [];}
        async capacity(){return {available:true,retryAfterMs:0};}
        async create(host,additionalHosts){calls.push({host,additionalHosts});return {id:'browser-1',disconnect:async()=>{}};}
      }
      export async function browserCommand(binding,id,origin,request){return {url:origin,documentStatus:200};}
    `);
    const source=(await readFile('src/implementation-broker.ts','utf8'))
      .replace('import { getSandbox } from "@cloudflare/sandbox";','const getSandbox = (): never => { throw new Error("Hosted browser must not allocate a Sandbox"); };')
      .replace('from "./implementation-browser.ts"',`from ${JSON.stringify(pathToFileURL(browserModule).href)}`)
      .replaceAll(/from "\.\/(.*?)"/g,(_match,path)=>`from ${JSON.stringify(pathToFileURL(resolve('src',path)).href)}`);
    const file=join(dir,'broker.ts');await writeFile(file,source);
    const {ImplementationBroker}=await import(pathToFileURL(file).href);
    const {calls}=await import(pathToFileURL(browserModule).href);
    const store=new ImplementationStore(db as unknown as D1Database,bucket as unknown as R2Bucket);
    const subject={change:'sample',approvedDesignSha:'a'.repeat(40),testedBaseSha:'b'.repeat(40),treeSha:'c'.repeat(40)};
    const work=await store.allocate({version:1,runId:'run-1',repository:'owner/repo',change:'sample',branch:'deos/agent/SAC-172/run-1',
      approvedDesignSha:subject.approvedDesignSha,testedBaseSha:subject.testedBaseSha,policy:implementationPolicy,
      approvedFiles:[],issue:{},receipts:{},requirements:{kinds:[],reasons:[],blockedProviders:[]}}, {userId:'human',revision:1},'SAC-172',1);
    await store.beginTry(work,{attempt_id:'attempt',sandbox_id:'impl-attempt',visit_sequence:1},'build');
    const origin='https://review.example-preview.pages.dev';
    const receipt=await store.put('run-1','preview.json',JSON.stringify({registrationId:'published',
      request:{runId:'run-1',inputSha:work.input_sha},subject,origin}));
    db.sqlite.prepare('INSERT INTO implementation_hosted_previews VALUES (?,?,?,?,?,?,?,?)')
      .run('published','run-1',work.input_sha,'d'.repeat(64),subject.treeSha,receipt.key,receipt.sha256,new Date().toISOString());
    const broker=new ImplementationBroker({DB:db,ARTIFACTS:bucket});
    const claims={runId:'run-1',attemptId:'attempt',actions:['implementation.tools']};
    const request={action:'browser',operation:'navigate',target:'hosted',url:'/',subject};
    let response=await broker.handle(claims,request);
    assert.equal(response.status,200,await response.clone().text());
    assert.equal((await response.json()).url,origin);
    assert.equal(await store.resource('attempt','preview'),null);
    assert.equal(calls.length,1);
    assert.equal(calls[0].host,new URL(origin).hostname);
    // A local allocation can fail independently after the hosted browser exists.
    await store.allocateResource('run-1','attempt','preview','cloudflare');
    db.sqlite.prepare("UPDATE implementation_resources SET status='quarantined',preview_origin=? WHERE kind='preview'")
      .run('https://failed-relay.trycloudflare.com');
    response=await broker.handle(claims,{...request,operation:'state'});
    assert.equal(response.status,200,await response.clone().text());
    assert.equal(calls.length,1,'Reuse the assigned browser');
    response=await broker.handle(claims,{...request,target:'local'});
    assert.equal(response.status,400,'Local commands still need a ready local resource');
    assert.match(await response.text(),/Resource is not ready/);
  } finally {db.close();await rm(dir,{recursive:true,force:true});}
});
