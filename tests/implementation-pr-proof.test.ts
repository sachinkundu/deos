import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {Buffer} from 'node:buffer';
import {ImplementationGitHub} from '../src/implementation-github.ts';
import {ImplementationStore} from '../src/implementation-store.ts';
import {ImplementationService} from '../src/implementation-service.ts';
import {publishImplementationProof} from '../src/implementation-pr-proof.ts';
import {implementationPolicy, type ImplementationCandidate} from '../src/implementation-contract.ts';
import {D1PlanningStore} from '../src/planning-store.ts';
import {D1DesignStore} from '../src/design-store.ts';
import {ImplementationTestDatabase, ImplementationTestBucket, seedRun} from './helpers/implementation-fixture.ts';
import type {LoadedWorkflowDefinition} from '../src/workflow-definition.ts';
import {createEvidenceChecklist, updateEvidenceChecklist} from '../container/implementation-evidence-checklist.mjs';

for (const privateRepository of [false, true]) test(`GitHub proof preserves binary images, replay and the PR template for ${privateRepository ? 'private' : 'public'} repositories`, async()=>{
  const db=new ImplementationTestDatabase(); seedRun(db);
  const bucket=new ImplementationTestBucket();
  const store=new ImplementationStore(db as unknown as D1Database,bucket as unknown as R2Bucket);
  try {
    const work=await store.allocate({version:1,runId:'run-1',repository:'owner/repo',change:'sample',branch:'deos/agent/SAC-172/run-1',
      approvedDesignSha:'a'.repeat(40),testedBaseSha:'b'.repeat(40),policy:implementationPolicy,approvedFiles:[],
      issue:{title:'Build a simple web calculator',url:'https://linear.app/issue/SAC-172'},receipts:{},
      requirements:{kinds:[],reasons:[],blockedProviders:[]}}, {userId:'human',revision:1},'SAC-172',1);
    const pixels=Uint8Array.from({length:20001},(_,i)=>i%256);
    const image=await store.put(work.run_id,'browser.png',pixels,'image/png');
    const record=await store.put(work.run_id,'showboat.md','# Demo\n\n```bash\ncalculator 1 + 2\n```\n\n```output\n3\n```');
    const internal=await store.put(work.run_id,'internal.md','INTERNAL UNIT TEST RESULTS');
    const subject={change:'sample',approvedDesignSha:work.approved_design_sha,testedBaseSha:work.tested_base_sha,treeSha:'c'.repeat(40)};
    const candidate={...subject,proof:[
      {...subject,id:'image',kind:'browser_image',path:image.key,sha256:image.sha256,sanitized:true,caption:`One plus two shows 3 [result]\nCaptured from https://preview.test/; checked maintainer deployment ${'1'.repeat(64)}`},
      {...subject,id:'demo',kind:'showboat',audience:'review',path:record.key,sha256:record.sha256,sanitized:true,caption:'Live calculator command'},
    {...subject,id:'internal',kind:'showboat',path:internal.key,sha256:internal.sha256,sanitized:true,caption:'Internal tests'},
    ],checks:[{command:'unit tests',exitCode:1}],summary:'Claude said needs work, Sol replied.'} as ImplementationCandidate;
    const plan={sha256:'a'.repeat(64),value:{scenarios:[{id:'calculate',title:'Calculate a result'}]}};
    candidate.evidenceChecklist=updateEvidenceChecklist(createEvidenceChecklist(plan),[
      {id:'calculate',state:'complete',evidenceIds:['image','demo'],reason:'The screen and command show the result.'},
    ],candidate.proof,{attemptId:'author',treeSha:subject.treeSha,occurredAt:'now'});
    const blobs=new Map<string,Buffer>(); let entries:{path:string;sha:string}[]=[];
    let ref:string|null=null, writes=0;const head='e'.repeat(40);
    const github=new ImplementationGitHub('https://api.github.com','owner/repo',{token:async()=>'test'},(async(url,init)=>{
      const path=new URL(String(url)).pathname.replace('/repos/owner/repo','');
      const body=init?.body ? JSON.parse(String(init.body)):null;
      if(path==='')return Response.json({private:privateRepository});
      if(init?.method==='POST')writes++;
      if(path.startsWith('/git/ref/heads/deos/proof/'))return ref?Response.json({object:{sha:ref}}):Response.json({}, {status:404});
      if(path==='/git/blobs'){
        assert.equal(body.encoding,'base64');const bytes=Buffer.from(body.content,'base64');
        const sha=createHash('sha1').update(bytes).digest('hex');blobs.set(sha,bytes);return Response.json({sha});
      }
      if(path==='/git/trees'){assert.equal(body.base_tree,undefined);entries=body.tree;return Response.json({sha:'f'.repeat(40)});}
      if(path==='/git/commits'){assert.deepEqual(body.parents,[]);return Response.json({sha:head});}
      if(path==='/git/refs'){
        assert.match(body.ref,/^refs\/heads\/deos\/proof\/SAC-172\/run-1\/[a-f0-9]{64}$/);
        ref=head;throw new Error('Lost successful ref response');
      }
      if(path==='/contents/manifest.json'){
        const bytes=blobs.get(entries.find(v=>v.path==='manifest.json')!.sha)!;
        return Response.json({encoding:'base64',content:btoa(String.fromCharCode(...bytes))});
      }
      throw new Error(`Unexpected GitHub request: ${path}`);
    }) as typeof fetch);
    const published=await publishImplementationProof(github,store,work,candidate,plan);
    assert.deepEqual(blobs.get(entries.find(v=>v.path.endsWith('.png'))!.sha),Buffer.from(pixels));
    assert.doesNotMatch(blobs.get(entries.find(v=>v.path==='showboat.md')!.sha)!.toString(),/INTERNAL UNIT TEST/);
    const firstWrites=writes;
    assert.deepEqual(await publishImplementationProof(github,store,work,candidate,plan),published);
    assert.equal(writes,firstWrites,'Replay reads the immutable proof branch');
    assert.equal(published.images[0].url,privateRepository
      ? `../blob/${head}/images/${image.sha256}.png?raw=true`
      : `https://raw.githubusercontent.com/owner/repo/${head}/images/${image.sha256}.png`);
    if (!privateRepository) assert.equal(new URL(published.images[0].url).pathname,`/owner/repo/${head}/images/${image.sha256}.png`);
    assert.doesNotMatch(blobs.get(entries.find(v=>v.path==='showboat.md')!.sha)!.toString(),/Captured from|checked maintainer deployment/);
    assert.match(blobs.get(entries.find(v=>v.path==='showboat.md')!.sha)!.toString(),/calculator 1 \+ 2/);
    const checklist=blobs.get(entries.find(v=>v.path==='evidence-checklist.md')!.sha)!.toString();
    assert.match(checklist,/- \[x\] Calculate a result/);
    assert.ok(checklist.includes(`images/${image.sha256}.png`));
    assert.match(checklist,/showboat.md#evidence-[a-f0-9]{64}/);
    assert.equal(JSON.parse(blobs.get(entries.find(v=>v.path==='evidence-checklist.json')!.sha)!.toString()).items[0].state,'complete');
    await new D1PlanningStore(db as unknown as D1Database).allocateRunWorkProduct({runId:work.run_id,repository:'owner/repo',changeId:'sample',now:work.created_at});
    await new D1DesignStore(db as unknown as D1Database).allocate({runId:work.run_id,repository:'owner/repo',baseCommit:'a'.repeat(40),changeId:'sample',now:work.created_at});
    db.sqlite.exec("UPDATE run_work_products SET pull_request_number=31,pull_request_database_id=31,pull_request_url='https://github.com/owner/repo/pull/31'; UPDATE design_work_products SET pull_request_number=32,pull_request_database_id=32,pull_request_url='https://github.com/owner/repo/pull/32';");
    const service=new ImplementationService({DB:db,ARTIFACTS:bucket} as unknown as Env,{} as LoadedWorkflowDefinition);
    const body=await service.prBody(work,published);
    assert.match(body,/Approved Proposal and Specs: \[PR #31\]/);
    assert.match(body,/Approved design: \[PR #32\]/);
    assert.match(body,/Proof:\n\n1\. One plus two shows 3/);
    assert.match(body,/\n\n   !\[One plus two shows 3 \\\[result\\\]\]/);
    assert.match(body,/This is the \[Showboat file\]/);
    assert.match(body,/\[Evidence checklist\].*evidence-checklist.md/);
    assert.doesNotMatch(body,/unit tests|exit 1|Claude|Sol|Checked tree|api\/implementation|Captured from/);
  } finally {db.close();}
});
