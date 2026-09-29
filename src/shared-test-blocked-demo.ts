import {SharedTestCloseStore} from './shared-test-close.ts';
import {SharedTestFailureStore} from './shared-test-failures.ts';
import {SharedTestPrBodyWriter} from './shared-test-pr-body.ts';
import {implementationGitHub,type ImplementationPull} from './implementation-github.ts';
import {D1OrchestrationStore} from './orchestration-store.ts';
import {sha256Hex} from './implementation-hash.ts';
import {snapshotBlockedSetup} from './shared-test-setup-snapshot.ts';

interface Subject {
  run_id:string;lease_id:string;attempt_id:string;candidate_commit:string;
  repository:string;branch:string;pull_request_number:number;task_key:string;
  fence:number;manifest_id:string;state:string;attempt_state:string;started_at:string;ended_at:string;
}
const hashBytes=async(bytes:ArrayBuffer)=>[...new Uint8Array(
  await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');

/** Retire an app-setup failure without inventing a completed demo. This explicit
 * operator action retains every saved artifact before owned-resource cleanup. */
export async function closeBlockedSharedTestDemo(request:Request,env:Env,
  githubForRun:typeof implementationGitHub=implementationGitHub):Promise<Response> {
  if(request.method!=='POST')return Response.json({error:'method_not_allowed'},{status:405});
  if(!env.STAGE_RETRY_SECRET || request.headers.get('Authorization')!==`Bearer ${env.STAGE_RETRY_SECRET}`)
    return Response.json({error:'invalid_operator_capability'},{status:401});
  const input=await request.json() as Record<string,unknown>;
  if(!input || Object.keys(input).sort().join(',')!=='attemptId,candidateCommit,fence,leaseId,runId,version' ||
      input.version!==1 || ![input.runId,input.attemptId].every(v=>typeof v==='string'&&v.length>0) ||
      typeof input.leaseId!=='string' || !/^[a-f0-9]{64}$/.test(input.leaseId) ||
      typeof input.candidateCommit!=='string' || !/^[a-f0-9]{40}$/.test(input.candidateCommit) ||
      !Number.isSafeInteger(input.fence))throw new Error('test_blocked_demo_request_invalid');
  const prior=await env.DB.prepare(`SELECT a.abort_kind,a.attempt_id,a.failure_evidence_key,
    a.failure_evidence_sha256,a.closed_at,l.candidate_commit,l.fence
    FROM test_lease_aborts a JOIN test_leases l ON l.lease_id=a.lease_id
    WHERE a.lease_id=? AND a.run_id=?`)
    .bind(input.leaseId,input.runId).first<Record<string,unknown>>();
  if(prior) {
    if(prior.abort_kind!=='blocked_demo' || prior.attempt_id!==input.attemptId ||
        prior.candidate_commit!==input.candidateCommit || prior.fence!==input.fence)
      throw new Error('test_blocked_demo_abort_subject_changed');
    return Response.json({state:prior.closed_at?'closed':'cleanup_pending',...prior});
  }
  const subject=await env.DB.prepare(`SELECT l.run_id,l.lease_id,l.attempt_id,l.candidate_commit,
    l.repository,l.branch,l.pull_request_number,l.task_key,l.fence,a.manifest_id,e.state,
      a.state AS attempt_state,a.started_at,a.ended_at
    FROM test_environment e JOIN test_leases l ON l.lease_id=e.owner_lease_id
    JOIN agent_attempts a ON a.attempt_id=l.attempt_id AND a.run_id=l.run_id
    WHERE e.site_id=1 AND e.owner_run_id=? AND e.owner_lease_id=?
      AND e.state IN ('active','quiescing') AND l.fence=?
      AND ((e.state='active' AND e.fence=l.fence) OR
        (e.state='quiescing' AND e.fence=l.fence+1 AND e.saved_phase='active'))
      AND l.candidate_commit=? AND l.attempt_id=? AND l.activated_at IS NOT NULL
      AND a.node_id='shared_test_demo' AND (a.state='blocked' OR
        (a.state='failed' AND a.result_class='startup_failed' AND a.process_id IS NULL
          AND NOT EXISTS (SELECT 1 FROM test_github_sessions WHERE lease_id=l.lease_id)))
      AND EXISTS (SELECT 1 FROM artifact_manifests m WHERE m.manifest_id=a.manifest_id AND m.state='complete')
      AND a.cleanup_state='destroyed' AND a.ended_at IS NOT NULL AND a.manifest_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM test_attestations WHERE lease_id=l.lease_id AND state='complete')
      AND NOT EXISTS (SELECT 1 FROM test_review_scenarios WHERE lease_id=l.lease_id)
      AND NOT EXISTS (SELECT 1 FROM agent_attempts x WHERE x.run_id=l.run_id
        AND x.state IN ('pending','starting','running','collecting'))`)
    .bind(input.runId,input.leaseId,input.fence,input.candidateCommit,input.attemptId)
    .first<Subject>();
  if(!subject)throw new Error('test_blocked_demo_subject_not_ready');
  const artifacts=(await env.DB.prepare(`SELECT logical_name,r2_key,sha256,byte_size
    FROM artifacts WHERE manifest_id=? AND policy_outcome='accepted' ORDER BY logical_name`)
    .bind(subject.manifest_id).all<{logical_name:string;r2_key:string;sha256:string;byte_size:number}>()).results;
  const result=artifacts.find(a=>a.logical_name==='result.json');
  const startup=subject.attempt_state==='failed';
  const startupSummary=artifacts.find(a=>a.logical_name==='failure-summary.json');
  if(startup ? !startupSummary : (!result || !artifacts.some(a=>a.logical_name==='transcript.jsonl')))
    throw new Error('test_blocked_demo_original_artifacts_missing');
  let resultText='',startupText='';
  for(const artifact of artifacts) {
    const object=await env.ARTIFACTS.get(artifact.r2_key);
    if(!object)throw new Error(`test_blocked_demo_artifact_missing:${artifact.logical_name}`);
    const bytes=await object.arrayBuffer();
    if(bytes.byteLength!==artifact.byte_size || await hashBytes(bytes)!==artifact.sha256)
      throw new Error(`test_blocked_demo_artifact_changed:${artifact.logical_name}`);
    if(artifact===result)resultText=new TextDecoder().decode(bytes);
    if(artifact===startupSummary)startupText=new TextDecoder().decode(bytes);
  }
  const outcome=startup ? null : JSON.parse(resultText) as {outcome:string;summary:string;blocker:string};
  if(!startup && (outcome?.outcome!=='blocked' || !outcome.blocker))
    throw new Error('test_blocked_demo_original_result_not_blocked');
  if(startup) {
    const summary=JSON.parse(startupText) as {attemptId:string;safeErrorCategory:string};
    if(summary.attemptId!==subject.attempt_id||summary.safeErrorCategory!=='startup_failed')
      throw new Error('test_startup_failure_summary_changed');
  }
  const originalErrors=[];
  if(startup) {
    const errors=(await env.DB.prepare(`SELECT error_id,location,message,detail_r2_key,occurred_at
      FROM workflow_errors WHERE run_id=? AND occurred_at>=? AND occurred_at<=? ORDER BY occurred_at`)
      .bind(subject.run_id,subject.started_at,subject.ended_at)
      .all<{error_id:string;location:string;message:string;detail_r2_key:string;occurred_at:string}>()).results;
    if(!errors.some(e=>e.location.startsWith('sandbox.start.')||e.location==='sandbox.repository_checkout'))
      throw new Error('test_startup_original_error_missing');
    for(const error of errors) {
      const object=await env.ARTIFACTS.get(error.detail_r2_key);
      if(!object)throw new Error('test_startup_original_error_object_missing');
      const bytes=await object.arrayBuffer(),hash=await hashBytes(bytes);
      const readback=await env.ARTIFACTS.get(error.detail_r2_key);
      if(!readback||await hashBytes(await readback.arrayBuffer())!==hash)
        throw new Error('test_startup_original_error_changed');
      originalErrors.push({...error,sha256:hash,bytes:bytes.byteLength});
    }
  }
  const captures=(await env.DB.prepare(`SELECT proof_id,kind,object_key,source_sha256
    FROM test_proof_items WHERE lease_id=? ORDER BY proof_id`)
    .bind(subject.lease_id).all<{proof_id:string;kind:string;object_key:string;source_sha256:string}>()).results;
  for(const capture of captures) {
    const object=await env.ARTIFACTS.get(capture.object_key);
    if(!object || await hashBytes(await object.arrayBuffer())!==capture.source_sha256)
      throw new Error(`test_blocked_demo_capture_missing_or_changed:${capture.proof_id}`);
  }
  const run=await new D1OrchestrationStore(env.DB).findRun(subject.run_id);
  if(!run || run.route_repository!==subject.repository)throw new Error('test_blocked_demo_run_changed');
  const github=githubForRun(env,run);
  const readPull=async()=>{
    const pull=await github.json<ImplementationPull>(`/pulls/${subject.pull_request_number}`);
    if(pull.head.sha!==subject.candidate_commit || pull.head.ref!==subject.branch ||
        pull.base.repo.full_name!==subject.repository || pull.base.ref!=='main' ||
        pull.state!=='open' || !pull.draft)throw new Error('test_blocked_demo_pull_changed');
    return pull;
  };
  await readPull();
  const now=new Date().toISOString();
  const priorFault=await env.DB.prepare(`SELECT fault_id FROM test_failures
    WHERE run_id=? AND lease_id=? AND work_id=? AND safe_code='test_demo_setup_blocked'
    ORDER BY occurred_at,fault_id LIMIT 1`)
    .bind(subject.run_id,subject.lease_id,`blocked-demo:${subject.attempt_id}`)
    .first<{fault_id:string}>();
  const faultId=priorFault?.fault_id??await new SharedTestFailureStore(env.DB,env.ARTIFACTS).record({
    runId:subject.run_id,leaseId:subject.lease_id,fence:subject.fence,
    phase:'active',operation:'shared_test.blocked_demo',safeCode:'test_demo_setup_blocked',
    workId:`blocked-demo:${subject.attempt_id}`,
  },new Error(startup?'Demo runner failed before its process started':outcome!.blocker));
  await new SharedTestCloseStore(env.DB).quiesce(subject.run_id,subject.lease_id,subject.fence);
  const setupSnapshot=await snapshotBlockedSetup(env,subject.run_id,subject.lease_id);
  const evidence={version:2,kind:'blocked_demo',runId:subject.run_id,leaseId:subject.lease_id,
    attemptId:subject.attempt_id,candidateCommit:subject.candidate_commit,manifestId:subject.manifest_id,
    faultId,artifacts,captures,setupSnapshot,result:outcome,
    startupFailure:startup?{summary:JSON.parse(startupText),originalErrors}:null};
  const evidenceText=JSON.stringify(evidence),digest=await sha256Hex(evidenceText);
  const key=`shared-test/failed/${subject.lease_id}/${digest}.json`;
  await env.ARTIFACTS.put(key,evidenceText,{onlyIf:{etagDoesNotMatch:'*'},
    httpMetadata:{contentType:'application/json'},customMetadata:{evidenceClass:'private-failure'}});
  const checked=await env.ARTIFACTS.get(key);
  if(!checked || await sha256Hex(await checked.text())!==digest)
    throw new Error('test_blocked_demo_evidence_readback_failed');
  const writer=new SharedTestPrBodyWriter(env.DB,{
    read:async(repository,number)=>{
      if(repository!==subject.repository || number!==subject.pull_request_number)
        throw new Error('test_blocked_demo_pr_scope_changed');
      return (await readPull()).body??'';
    },
    write:async(repository,number,body)=>{
      if(repository!==subject.repository || number!==subject.pull_request_number)
        throw new Error('test_blocked_demo_pr_scope_changed');
      await readPull();
      await github.json(`/pulls/${number}`,{method:'PATCH',body:JSON.stringify({body})});
    },
  });
  const section=[`### ${subject.task_key} test setup blocked`,
    `Candidate: ${subject.candidate_commit}. Attempt: ${subject.attempt_id}.`,
    startup?'The test runner failed during startup. No review scenario ran; all remain unverified.':
      'The deployed app could not finish review setup. The review scenarios remain unverified.',
    startup?'The original startup error, failure summary, and lease store snapshots are retained privately with verified hashes.':
      'The original result, transcript, commands, captures, and lease store snapshots are retained privately with verified hashes.',
    `Failure evidence SHA-256: ${digest}. Saved fault: ${faultId}.`,
    'This abort grants no test or release approval. Owned resources must pass removal and absence checks before the site can be reused.'].join('\n\n');
  await writer.writeSection({repository:subject.repository,pullRequestNumber:subject.pull_request_number,
    workId:`test-blocked-demo:${subject.lease_id}`,runId:subject.run_id,leaseId:subject.lease_id,
    marker:`deos-test-abort:${subject.lease_id}`,section});
  const inserted=await env.DB.prepare(`INSERT INTO test_lease_aborts
    (lease_id,run_id,first_fault_id,proof_body_sha256,proof_read_at,abort_kind,attempt_id,
      failure_evidence_key,failure_evidence_sha256)
    SELECT ?,?,?,?,?,'blocked_demo',?,?,? WHERE EXISTS (SELECT 1 FROM test_environment
      WHERE site_id=1 AND state='quiescing' AND owner_run_id=? AND owner_lease_id=? AND fence=?)`)
    .bind(subject.lease_id,subject.run_id,faultId,await sha256Hex(section),now,subject.attempt_id,
      key,digest,subject.run_id,subject.lease_id,subject.fence+1).run();
  if(inserted.meta.changes!==1)throw new Error('test_blocked_demo_abort_fenced');
  return Response.json({state:'cleanup_pending',leaseId:subject.lease_id,failureEvidenceSha256:digest});
}
