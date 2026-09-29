import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {ImplementationTestDatabase,ImplementationTestBucket,seedRun,seedAttempt} from './helpers/implementation-fixture.ts';
import {closeBlockedSharedTestDemo} from '../src/shared-test-blocked-demo.ts';
import {repairSharedTestCandidate} from '../src/shared-test-candidate-repair.ts';
import {SharedTestCloseStore} from '../src/shared-test-close.ts';
import {SharedTestDecisionStore,stagingManifestDigest} from '../src/shared-test-decision-store.ts';
import {sha256Hex} from '../src/implementation-hash.ts';
import {retryBlockedSharedTestSetup,sharedTestSetupRepairRevision} from '../src/shared-test-setup-retry.ts';
import type {implementationGitHub} from '../src/implementation-github.ts';

for(const startup of [false,true]) test(`${startup?'startup failure':'blocked demo'} retains original proof and closes without approval`,async()=>{
  const db=new ImplementationTestDatabase(),bucket=new ImplementationTestBucket();
  const leaseId='a'.repeat(64),oldHead='b'.repeat(40),newHead='c'.repeat(40),base='d'.repeat(40);
  const oldTree='e'.repeat(40),newTree='f'.repeat(40),secret='test-operator-secret';
  seedRun(db);seedAttempt(db,'attempt-1');
  db.sqlite.prepare(`UPDATE orchestration_runs SET current_node='shared_test_demo',status='active',
    route_repository='owner/repo',route_github_installation_id='1'`).run();
  db.sqlite.prepare(`INSERT INTO artifact_manifests
    (manifest_id,run_id,attempt_id,r2_key,state,created_at)
    VALUES ('manifest','run-1','attempt-1','manifest.json','complete','now')`).run();
  db.sqlite.prepare(`UPDATE agent_attempts SET node_id='shared_test_demo',state='blocked',
    cleanup_state='destroyed',manifest_id='manifest',ended_at='now'`).run();
  if(startup) {
    db.sqlite.prepare(`UPDATE agent_attempts SET state='failed',result_class='startup_failed',
      process_id=NULL,started_at='a',ended_at='z'`).run();
    db.sqlite.prepare(`INSERT INTO workflow_errors
      (error_id,run_id,step_name,location,message,detail_r2_key,occurred_at)
      VALUES ('original','run-1','start','sandbox.start.creation_failed','original checkout failure','original-error','n')`).run();
    await bucket.put('original-error',JSON.stringify({message:'original checkout failure',cause:{status:502}}));
  }
  const originalArtifacts=startup ? [['failure-summary.json',JSON.stringify({version:1,attemptId:'attempt-1',safeErrorCategory:'startup_failed'})]]:
    [['result.json',JSON.stringify({outcome:'blocked',blocker:'original missing client ID'})],
    ['transcript.jsonl','{"original":"provider failure"}\n']];
  for(const [name,content] of originalArtifacts) {
    await bucket.put(name,content);
    db.sqlite.prepare(`INSERT INTO artifacts
      (manifest_id,logical_name,r2_key,media_type,byte_size,sha256,policy_outcome,created_at)
      VALUES ('manifest',?,?, 'application/json',?,?,'accepted','now')`)
      .run(name,name,new TextEncoder().encode(content).length,await sha256Hex(content));
  }
  const patch='old patch',oldPatch=await sha256Hex(patch);
  db.sqlite.prepare(`INSERT INTO test_lease_requests
    (request_id,run_id,node_visit,attempt_id,task_id,candidate_commit,patch_sha256,state,created_at,updated_at)
    VALUES ('request','run-1',1,'attempt-1','issue-1',?,?,'granted','now','now')`).run(oldHead,oldPatch);
  db.sqlite.prepare(`INSERT INTO test_leases
    (lease_id,request_id,run_id,attempt_id,task_id,task_key,task_title,team_id,stage,state,fence,
      base_manifest_id,base_traffic_revision,base_json,repository,branch,pull_request_number,
      candidate_commit,patch_sha256,created_at,activated_at)
    VALUES (?,'request','run-1','attempt-1','issue-1','SAC-182','Review','team','shared_test_demo','active',1,
      'base','base','{}','owner/repo','deos/agent/SAC-182/run-1',137,?,?,'now','now')`).run(leaseId,oldHead,oldPatch);
  db.sqlite.prepare(`UPDATE test_environment SET state='active',owner_run_id='run-1',owner_lease_id=?,
    fence=1,heartbeat_due_at=?`).run(leaseId,new Date(Date.now()+3600_000).toISOString());
  const request=(path:string,body:unknown)=>new Request(`https://coordinator/${path}`,{
    method:'POST',headers:{Authorization:`Bearer ${secret}`},body:JSON.stringify(body)});
  const env={DB:db,ARTIFACTS:bucket,STAGE_RETRY_SECRET:secret} as unknown as Env;
  const input={version:1,runId:'run-1',leaseId,attemptId:'attempt-1',candidateCommit:oldHead,fence:1};
  let liveHead=oldHead,body='Existing human text',writes=0;
  const content='export const candidate = true;\n';
  const blobSha=createHash('sha1').update(`blob ${Buffer.byteLength(content)}\0`).update(content).digest('hex');
  const file={path:'portal/src/repair.ts',mode:'100644',contentBase64:btoa(content),sha:blobSha};
  const githubForRun=(()=>({
    json:async(path:string,init?:RequestInit)=>{
      if(path.startsWith('/compare/'))return {status:'ahead',total_commits:1,
        files:[{filename:file.path,sha:blobSha,status:'added'}]};
      assert.equal(path,'/pulls/137');
      if(init?.method==='PATCH'){writes++;body=JSON.parse(String(init.body)).body;}
      return {number:137,head:{sha:liveHead,ref:'deos/agent/SAC-182/run-1'},
        base:{ref:'main',repo:{full_name:'owner/repo'}},state:'open',draft:true,body};
    },current:async()=>{},ref:async()=>liveHead,matches:async()=>true,
  })) as unknown as typeof implementationGitHub;
  try {
    if(startup) {
      db.sqlite.prepare("UPDATE agent_attempts SET process_id='started'").run();
      await assert.rejects(closeBlockedSharedTestDemo(request('close',input),env,githubForRun),/subject_not_ready/);
      db.sqlite.prepare('UPDATE agent_attempts SET process_id=NULL').run();
    }
    const [changedName,originalContent]=originalArtifacts.at(-1)!;
    bucket.objects.set(changedName,new TextEncoder().encode('changed'));
    await assert.rejects(closeBlockedSharedTestDemo(request('close',input),env,githubForRun),/artifact_changed/);
    assert.equal(db.sqlite.prepare('SELECT state FROM test_environment').get()?.state,'active');
    assert.equal(writes,0);
    bucket.objects.set(changedName,new TextEncoder().encode(originalContent));
    const result=await (await closeBlockedSharedTestDemo(request('close',input),env,githubForRun)).json() as {state:string};
    assert.equal(result.state,'cleanup_pending');
    assert.equal(writes,1);assert.match(body,/Existing human text/);assert.match(body,/remain unverified/);
    const abort=db.sqlite.prepare('SELECT failure_evidence_key,failure_evidence_sha256 FROM test_lease_aborts').get()!;
    const evidenceText=await (await bucket.get(String(abort.failure_evidence_key)))!.text();
    assert.equal(await sha256Hex(evidenceText),abort.failure_evidence_sha256);
    const evidence=JSON.parse(evidenceText);
    if(startup) {
      assert.equal(evidence.result,null);
      assert.equal(evidence.startupFailure.originalErrors[0].message,'original checkout failure');
      assert.equal(evidence.startupFailure.summary.safeErrorCategory,'startup_failed');
    } else assert.equal(evidence.startupFailure,null);
    await closeBlockedSharedTestDemo(request('close',input),env,githubForRun);assert.equal(writes,1);
    const close=new SharedTestCloseStore(db as unknown as D1Database);
    await close.cleaningFailedSetup('run-1',leaseId,2);
    assert.equal((await close.abortFailedSetup('run-1',leaseId,2)).kind,'blocked_demo');
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM test_attestations').get()?.n,0);

    const oldCandidate={version:1,kind:'build',outcome:'completed',change:'sac-182',
      approvedDesignSha:'1'.repeat(40),testedBaseSha:base,treeSha:oldTree,patchSha:oldPatch,files:[file],checks:[],proof:[]};
    const oldCandidateText=JSON.stringify(oldCandidate),oldCandidateSha=await sha256Hex(oldCandidateText);
    await bucket.put('old-candidate',oldCandidateText);await bucket.put('old-patch',patch);
    db.sqlite.prepare(`INSERT INTO implementation_runs
      (run_id,linear_identifier,issue_run_sequence,change_id,approved_design_sha,tested_base_sha,branch,
       allowed_linear_user_id,human_binding_revision,input_key,input_sha,approved_files_json,requirements_json,
       tree_sha,candidate_key,candidate_sha,patch_key,patch_sha,pr_number,pr_head_sha,created_at,updated_at)
      VALUES ('run-1','SAC-182',1,'sac-182',?,?,'deos/agent/SAC-182/run-1','human',1,
        'approved-input','approved-sha','[]','{}',?,'old-candidate',?,'old-patch',?,137,?,'now','now')`)
      .run('1'.repeat(40),base,oldTree,oldCandidateSha,oldPatch,oldHead);
    db.sqlite.prepare(`INSERT INTO test_lease_requests
      (request_id,run_id,node_visit,attempt_id,task_id,candidate_commit,patch_sha256,state,created_at,updated_at)
      VALUES ('next-request','run-1',2,'attempt-2','issue-1',?,?,'waiting','now','now')`).run(oldHead,oldPatch);
    const retry={version:1,runId:'run-1',leaseId,candidateCommit:oldHead,
      failureEvidenceSha256:abort.failure_evidence_sha256,
      repairRevision:sharedTestSetupRepairRevision,reason:'Lease portal routing and setup helper were repaired.'};
    await assert.rejects(retryBlockedSharedTestSetup(request('retry',{...retry,repairRevision:'unknown'}),env),/input_invalid/);
    await assert.rejects(retryBlockedSharedTestSetup(request('retry',{...retry,candidateCommit:newHead}),env),/not_ready/);
    assert.deepEqual(await (await retryBlockedSharedTestSetup(request('retry',retry),env)).json(),
      {state:'authorized',requestId:'next-request'});
    await retryBlockedSharedTestSetup(request('retry',retry),env);
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM test_setup_retries').get()?.n,1);
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM test_attestations').get()?.n,0);
    const newPatch=await sha256Hex('new patch'),next={...oldCandidate,treeSha:newTree,patchSha:newPatch};
    const nextText=JSON.stringify(next),nextSha=await sha256Hex(nextText);
    const repair={version:1,runId:'run-1',leaseId,sourceCommit:oldHead,targetCommit:newHead,
      candidateKey:`implementation/run-1/${nextSha}/candidate.json`,candidateSha256:nextSha,
      patchKey:`implementation/run-1/${newPatch}/patch.diff`,patchSha256:newPatch};
    await bucket.put(repair.candidateKey,nextText);await bucket.put(repair.patchKey,'new patch');
    const service={service_name:'portal',source_commit:base,deploy_version:'version',build_input_sha256:'2'.repeat(64),
      app_paths_json:'["portal/"]',provider_paths_json:'[]'};
    db.sqlite.prepare(`INSERT INTO staging_release_manifests
      (manifest_id,revision,traffic_revision,service_count,digest_sha256,recorded_at)
      VALUES ('base',1,'base',1,?,'now')`).run(await stagingManifestDigest([service]));
    db.sqlite.prepare(`INSERT INTO staging_release_services
      (manifest_id,service_name,source_commit,deploy_version,build_input_sha256,app_paths_json,provider_paths_json,read_at)
      VALUES ('base','portal',?,'version',?,'["portal/"]','[]','now')`).run(base,'2'.repeat(64));
    db.sqlite.prepare("UPDATE staging_release_pointer SET state='stable',manifest_id='base',manifest_revision=1,traffic_revision='base'").run();
    await assert.rejects(repairSharedTestCandidate(request('repair',repair),env,githubForRun),/live_head_changed/);
    liveHead=newHead;
    assert.equal((await (await repairSharedTestCandidate(request('repair',repair),env,githubForRun)).json() as {state:string}).state,'adopted');
    const saved=db.sqlite.prepare('SELECT source_commit,source_candidate_key,target_commit FROM test_candidate_repairs').get();
    assert.deepEqual({...saved},{source_commit:oldHead,source_candidate_key:'old-candidate',target_commit:newHead});
    assert.equal(db.sqlite.prepare('SELECT input_key FROM implementation_runs').get()?.input_key,'approved-input');
    assert.deepEqual(await new SharedTestDecisionStore(db as unknown as D1Database).releaseCheck({runId:'run-1',
      candidateCommit:newHead,patchSha256:newPatch,manifestId:'base',manifestRevision:1,changedPaths:[file.path]}),
      {allowed:false,choice:'test_required'});
    await repairSharedTestCandidate(request('repair',repair),env,githubForRun);
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM test_candidate_repairs').get()?.n,1);
  } finally {db.close();}
});
