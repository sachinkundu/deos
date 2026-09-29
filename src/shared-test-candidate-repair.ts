import {ImplementationStore} from './implementation-store.ts';
import {validateImplementationPath,type ImplementationCandidate} from './implementation-contract.ts';
import {D1OrchestrationStore} from './orchestration-store.ts';
import {implementationGitHub,type ImplementationPull} from './implementation-github.ts';
import {SharedTestDecisionStore} from './shared-test-decision-store.ts';
import {sha256Hex} from './implementation-hash.ts';

interface RepairInput {
  version:1;runId:string;leaseId:string;sourceCommit:string;targetCommit:string;
  candidateKey:string;candidateSha256:string;patchKey:string;patchSha256:string;
}

/** Adopt a repaired draft only after the prior lease has a failed close receipt.
 * Approval inputs and the original candidate remain immutable and recoverable. */
export async function repairSharedTestCandidate(request:Request,env:Env,
  githubForRun:typeof implementationGitHub=implementationGitHub):Promise<Response> {
  if(request.method!=='POST')return Response.json({error:'method_not_allowed'},{status:405});
  if(!env.STAGE_RETRY_SECRET || request.headers.get('Authorization')!==`Bearer ${env.STAGE_RETRY_SECRET}`)
    return Response.json({error:'invalid_operator_capability'},{status:401});
  const input=await request.json() as RepairInput;
  if(!input || Object.keys(input).sort().join(',')!==
      'candidateKey,candidateSha256,leaseId,patchKey,patchSha256,runId,sourceCommit,targetCommit,version' ||
      input.version!==1 || typeof input.runId!=='string' || !input.runId ||
      ![input.sourceCommit,input.targetCommit].every(v=>typeof v==='string'&&/^[a-f0-9]{40}$/.test(v)) ||
      ![input.leaseId,input.candidateSha256,input.patchSha256].every(v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)) ||
      input.sourceCommit===input.targetCommit ||
      input.candidateKey!==`implementation/${input.runId}/${input.candidateSha256}/candidate.json` ||
      input.patchKey!==`implementation/${input.runId}/${input.patchSha256}/patch.diff`)
    throw new Error('test_candidate_repair_invalid');
  const repairId=await sha256Hex(JSON.stringify([input.runId,input.leaseId,input.sourceCommit,
    input.targetCommit,input.candidateSha256,input.patchSha256]));
  const prior=await env.DB.prepare('SELECT repair_id FROM test_candidate_repairs WHERE retired_lease_id=?')
    .bind(input.leaseId).first<{repair_id:string}>();
  if(prior) {
    if(prior.repair_id!==repairId)throw new Error('test_candidate_repair_conflict');
    return Response.json({state:'adopted',repairId,candidateCommit:input.targetCommit});
  }
  const closed=await env.DB.prepare(`SELECT 1 AS ready FROM test_leases l
    JOIN test_lease_aborts a ON a.lease_id=l.lease_id AND a.run_id=l.run_id
    JOIN test_lease_abort_guards g ON g.lease_id=l.lease_id AND g.ready=1
    WHERE l.lease_id=? AND l.run_id=? AND l.candidate_commit=? AND l.state='closed'
      AND a.abort_kind='blocked_demo' AND a.closed_at IS NOT NULL AND a.receipt_json IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM test_leases x WHERE x.run_id=l.run_id AND x.state<>'closed')
      AND NOT EXISTS (SELECT 1 FROM agent_attempts x WHERE x.run_id=l.run_id
        AND x.state IN ('pending','starting','running','collecting'))`)
    .bind(input.leaseId,input.runId,input.sourceCommit).first<{ready:number}>();
  if(closed?.ready!==1)throw new Error('test_candidate_repair_old_lease_not_closed');
  const store=new ImplementationStore(env.DB,env.ARTIFACTS),work=await store.requireRun(input.runId);
  const run=await new D1OrchestrationStore(env.DB).findRun(input.runId);
  if(!run || run.status!=='active' || run.current_node!=='shared_test_demo' ||
      work.pr_head_sha!==input.sourceCommit || !work.pr_number || !work.tree_sha ||
      !work.candidate_key || !work.candidate_sha || !work.patch_key || !work.patch_sha)
    throw new Error('test_candidate_repair_source_changed');
  await store.readBytes(work.patch_key,work.patch_sha);
  const original=await store.candidate(work);
  const candidate=await store.read<ImplementationCandidate>(input.candidateKey,input.candidateSha256);
  await store.readBytes(input.patchKey,input.patchSha256);
  if(candidate.version!==1 || candidate.kind!=='build' || candidate.outcome!=='completed' ||
      candidate.change!==work.change_id || candidate.approvedDesignSha!==work.approved_design_sha ||
      candidate.testedBaseSha!==work.tested_base_sha || candidate.patchSha!==input.patchSha256 ||
      candidate.proof.length || candidate.checks.length || candidate.proofArchive?.length ||
      candidate.evidenceChecklist || !/^[a-f0-9]{40}$/.test(candidate.treeSha) ||
      original.files.some(old=>!candidate.files.some(next=>next.path===old.path)))
    throw new Error('test_candidate_repair_candidate_changed');
  for(const file of candidate.files) {
    validateImplementationPath(file.path,work.change_id,'build');
    if(file.contentBase64===null) {
      if(file.sha!==null)throw new Error('test_candidate_repair_deleted_blob_invalid');
    } else {
      const bytes=Uint8Array.from(atob(file.contentBase64),c=>c.charCodeAt(0));
      const header=new TextEncoder().encode(`blob ${bytes.length}\0`);
      const blob=new Uint8Array(header.length+bytes.length);blob.set(header);blob.set(bytes,header.length);
      const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-1',blob))]
        .map(n=>n.toString(16).padStart(2,'0')).join('');
      if(digest!==file.sha)throw new Error('test_candidate_repair_blob_changed');
    }
  }
  const github=githubForRun(env,run);
  await github.current(work);
  const [pull,comparison]=await Promise.all([
    github.json<ImplementationPull>(`/pulls/${work.pr_number}`),
    github.json<{status:string;total_commits:number;files:Array<{filename:string;sha:string;status:string}>}>(
      `/compare/${work.tested_base_sha}...${input.targetCommit}`),
  ]);
  if(pull.number!==work.pr_number || pull.head.sha!==input.targetCommit || pull.head.ref!==work.branch ||
      pull.base.repo.full_name!==run.route_repository || pull.base.ref!=='main' ||
      pull.state!=='open' || !pull.draft || await github.ref(work.branch)!==input.targetCommit ||
      !await github.matches(input.targetCommit,work.tested_base_sha,candidate.treeSha) ||
      comparison.status!=='ahead' || comparison.total_commits!==1 ||
      !comparison.files || comparison.files.length!==candidate.files.length ||
      new Set(candidate.files.map(f=>f.path)).size!==candidate.files.length ||
      candidate.files.some(file=>!comparison.files.some(remote=>remote.filename===file.path &&
        (file.contentBase64===null?remote.status==='removed':remote.sha===file.sha))))
    throw new Error('test_candidate_repair_live_head_changed');
  const decision=await new SharedTestDecisionStore(env.DB).record({runId:input.runId,
    candidateCommit:input.targetCommit,patchSha256:input.patchSha256,
    changedPaths:candidate.files.map(file=>file.path)});
  if(decision.choice!=='test_required')throw new Error('test_candidate_repair_requires_fresh_demo');
  const now=new Date().toISOString();
  const writes=await env.DB.batch([
    env.DB.prepare(`INSERT INTO test_candidate_repairs
      (repair_id,run_id,retired_lease_id,source_commit,target_commit,source_candidate_key,
       source_candidate_sha256,source_patch_key,source_patch_sha256,source_tree_sha,
       target_candidate_key,target_candidate_sha256,target_patch_key,target_patch_sha256,target_tree_sha,
       tested_base_sha,committed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(repairId,input.runId,input.leaseId,input.sourceCommit,input.targetCommit,work.candidate_key,
        work.candidate_sha,work.patch_key,work.patch_sha,work.tree_sha,input.candidateKey,
        input.candidateSha256,input.patchKey,input.patchSha256,candidate.treeSha,work.tested_base_sha,now),
    env.DB.prepare(`UPDATE implementation_runs SET pr_head_sha=?,tree_sha=?,candidate_key=?,candidate_sha=?,
      patch_key=?,patch_sha=?,patch_base_sha=?,updated_at=? WHERE run_id=? AND pr_head_sha=?
      AND candidate_sha=? AND patch_sha=? AND tested_base_sha=?
      AND NOT EXISTS (SELECT 1 FROM test_leases WHERE run_id=? AND state<>'closed')
      AND NOT EXISTS (SELECT 1 FROM agent_attempts WHERE run_id=?
        AND state IN ('pending','starting','running','collecting'))`)
      .bind(input.targetCommit,candidate.treeSha,input.candidateKey,input.candidateSha256,
        input.patchKey,input.patchSha256,work.tested_base_sha,now,input.runId,input.sourceCommit,
        work.candidate_sha,work.patch_sha,work.tested_base_sha,input.runId,input.runId),
    env.DB.prepare(`INSERT INTO test_candidate_repair_guards(repair_id,ready)
      SELECT ?,CASE WHEN EXISTS (SELECT 1 FROM implementation_runs WHERE run_id=?
        AND pr_head_sha=? AND candidate_sha=? AND patch_sha=?) THEN 1 ELSE 0 END`)
      .bind(repairId,input.runId,input.targetCommit,input.candidateSha256,input.patchSha256),
  ]);
  if(writes.some(row=>row.meta.changes!==1))throw new Error('test_candidate_repair_transaction_incomplete');
  return Response.json({state:'adopted',repairId,candidateCommit:input.targetCommit});
}
