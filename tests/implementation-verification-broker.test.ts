import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {ImplementationStore} from '../src/implementation-store.ts';
import {implementationPolicy} from '../src/implementation-contract.ts';
import {sha256Hex} from '../src/implementation-hash.ts';
import {ImplementationTestDatabase,ImplementationTestBucket,seedRun,seedAttempt} from './helpers/implementation-fixture.ts';

test('supervisor verification capture completes without Sandbox callbacks and retains the same identity and proof gates',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'verification-broker-'));
  const db=new ImplementationTestDatabase(),bucket=new ImplementationTestBucket();seedRun(db);seedAttempt(db,'attempt');
  try {
    // Only the transport is replaced. Any callback into a Sandbox makes this test fail.
    const source=(await readFile('src/implementation-broker.ts','utf8'))
      .replace('import { getSandbox } from "@cloudflare/sandbox";','const getSandbox = (..._args: unknown[]): never => { throw new Error("Unexpected Sandbox callback"); };')
      .replaceAll(/from "\.\/(.*?)"/g,(_match,path)=>`from ${JSON.stringify(pathToFileURL(resolve('src',path)).href)}`);
    const file=join(dir,'broker.ts');await writeFile(file,source);
    const {ImplementationBroker}=await import(pathToFileURL(file).href);
    const store=new ImplementationStore(db as unknown as D1Database,bucket as unknown as R2Bucket);
    const subject={change:'sample',approvedDesignSha:'a'.repeat(40),testedBaseSha:'b'.repeat(40),treeSha:'c'.repeat(40)};
    const work=await store.allocate({version:1,runId:'run-1',repository:'owner/repo',change:'sample',branch:'deos/agent/SAC-172/run-1',
      approvedDesignSha:subject.approvedDesignSha,testedBaseSha:subject.testedBaseSha,policy:implementationPolicy,approvedFiles:[],issue:{},receipts:{},
      requirements:{kinds:['showboat'],reasons:[],blockedProviders:[]}}, {userId:'human',revision:1},'SAC-172',1);
    await store.beginTry(work,{attempt_id:'attempt',sandbox_id:'impl-attempt',visit_sequence:1},'build');
    const broker=new ImplementationBroker({DB:db,ARTIFACTS:bucket});
    const claims={runId:'run-1',attemptId:'attempt',actions:['implementation.tools']};
    const proof=await broker.proof(claims,subject,'showboat','actual checked output','text/plain','Behavior proof');
    const candidate={...subject,version:1,attemptId:'attempt',kind:'build',outcome:'completed',files:[],tasks:'- [x] Done',patchSha:await sha256Hex(''),
      checks:[{command:'check',exitCode:0,stdout:'large real output\n'.repeat(70_000),stderr:''}],proof:[proof],sources:[],assumptions:[],question:null};
    const verify=async(value=candidate,patch='')=>broker.handle(claims,{action:'verify',subject,capture:{candidate:value,patch}});
    let response=await verify();assert.equal(response.status,200);assert.equal((await response.json()).ready,true);
    const repeated=await broker.proof(claims,subject,'showboat','actual checked output','text/plain','Repeated check');
    assert.equal(repeated.id,proof.id,'Same capture identity remains idempotent');
    const nextSubject={...subject,treeSha:'d'.repeat(40)};
    const nextTreeProof=await broker.proof(claims,nextSubject,'showboat','actual checked output','text/plain','Same output after an edit');
    response=await broker.handle(claims,{action:'verify',subject:nextSubject,capture:{candidate:{...candidate,...nextSubject,proof:[nextTreeProof]},patch:''}});
    assert.equal(response.status,200,'Identical content captured for a new tree has a durable proof receipt');
    assert.equal((await response.json()).ready,true);
    seedAttempt(db,'next-attempt');
    await store.beginTry(work,{attempt_id:'next-attempt',sandbox_id:'impl-next',visit_sequence:1},'build');
    const nextClaims={...claims,attemptId:'next-attempt'};
    const nextAttemptProof=await broker.proof(nextClaims,subject,'showboat','actual checked output','text/plain','Same output in a new attempt');
    response=await broker.handle(nextClaims,{action:'verify',subject,capture:{candidate:{...candidate,attemptId:'next-attempt',proof:[nextAttemptProof]},patch:''}});
    assert.equal(response.status,200,'Identical content captured by a new attempt has its own durable proof receipt');
    assert.equal((await response.json()).ready,true);
    assert.equal(db.sqlite.prepare('SELECT count(*) n FROM implementation_proof').get()!.n,3);
    candidate.proof=[];response=await verify();assert.equal((await response.json()).ready,false);
    candidate.outcome='needs_human';candidate.question={blockKey:'preview',question:'Which safe preview can be used?',reason:'Assigned preview is unavailable.'} as never;
    response=await verify();assert.equal((await response.json()).ready,true,'A valid blocker is accepted without requiring a completed demo');
    response=await verify(candidate,'changed');assert.equal(response.status,400);assert.equal((await response.json()).error,'patch_integrity');
    response=await verify({...candidate,attemptId:'other'});assert.equal(response.status,400);assert.equal((await response.json()).error,'candidate_identity');
    assert.equal(db.sqlite.prepare('SELECT count(*) n FROM implementation_effect_errors').get()!.n,2);
  } finally {db.close();await rm(dir,{recursive:true,force:true});}
});
