import type {DemoReviewRow} from './implementation-demo-contract.ts';
import type {DemoEvidence,DemoSource} from './implementation-demo-contract.ts';
import {ImplementationStore,type ImplementationRun} from './implementation-store.ts';
import {sharedTestCompletedDemoSql} from './shared-test-demo-completion.ts';
import {sharedTestProofUrl} from './shared-test-proof-url.ts';
import {sha256Hex} from './implementation-hash.ts';

/** Inherit the plan, never the verdict, from the recorded same-design handoff. */
export async function inheritedSharedTestDemoPlan(db:D1Database,runId:string):Promise<DemoReviewRow|null> {
  return db.prepare(`SELECT p.* FROM shared_test_run_handoffs h
    JOIN implementation_runs source ON source.run_id=h.source_run_id
    JOIN implementation_runs target ON target.run_id=h.target_run_id
    JOIN orchestration_runs r ON r.run_id=target.run_id AND r.definition_digest=h.target_definition_digest
    JOIN orchestration_runs original ON original.run_id=source.run_id
      AND original.project_id=r.project_id AND original.issue_id=r.issue_id
    JOIN implementation_demo_reviews p ON p.run_id=source.run_id AND p.kind='plan'
    WHERE h.target_run_id=? AND h.state='dispatched'
      AND source.change_id=target.change_id AND source.approved_design_sha=target.approved_design_sha
      AND source.approved_files_json=target.approved_files_json
      AND source.requirements_json=target.requirements_json
    ORDER BY p.visit_sequence DESC LIMIT 1`).bind(runId).first<DemoReviewRow>();
}

/** Give the existing independent reviewer the closed lease's exact evidence. */
export async function sharedTestDemoReviewEvidence(db:D1Database,bucket:R2Bucket,work:ImplementationRun,
  fetcher:typeof fetch=globalThis.fetch.bind(globalThis)):Promise<{sources:DemoSource[];evidence:DemoEvidence[]}> {
  const decision=await db.prepare(`SELECT choice FROM test_task_decisions
    WHERE run_id=? AND candidate_commit=? AND patch_sha256=? LIMIT 1`)
    .bind(work.run_id,work.pr_head_sha,work.patch_sha).first<{choice:string}>();
  if(decision?.choice!=='test_required')return {sources:[],evidence:[]};
  const lease=await db.prepare(`SELECT l.lease_id,a.manifest_id,c.report_object_key,c.report_sha256
    FROM test_leases l JOIN agent_attempts a ON a.attempt_id=l.attempt_id AND a.run_id=l.run_id
    JOIN test_lease_closures c ON c.lease_id=l.lease_id AND c.run_id=l.run_id
    WHERE l.run_id=? AND l.candidate_commit=? AND l.patch_sha256=? AND l.state='closed'
      AND c.report_state='complete' AND ${sharedTestCompletedDemoSql('l.lease_id','l.run_id')}
    ORDER BY l.closed_at DESC LIMIT 1`).bind(work.run_id,work.pr_head_sha,work.patch_sha)
    .first<{lease_id:string;manifest_id:string;report_object_key:string;report_sha256:string}>();
  if(!lease?.report_object_key||!lease.report_sha256)throw new Error('shared_test_demo_evidence_missing');
  const store=new ImplementationStore(db,bucket),sources:DemoSource[]=[],evidence:DemoEvidence[]=[];
  const reportBytes=await store.readBytes(lease.report_object_key,lease.report_sha256);
  const reportText=new TextDecoder().decode(reportBytes);
  sources.push({path:'context/shared-test-close.json',content:reportText,sha256:lease.report_sha256});
  for(const name of ['result.json','validation.txt']) {
    const artifact=await db.prepare(`SELECT r2_key,sha256 FROM artifacts
      WHERE manifest_id=? AND logical_name=? AND policy_outcome='accepted'`)
      .bind(lease.manifest_id,name).first<{r2_key:string;sha256:string}>();
    if(!artifact)throw new Error(`shared_test_demo_evidence_artifact_missing:${name}`);
    const bytes=await store.readBytes(artifact.r2_key,artifact.sha256);
    if(bytes.byteLength>2_000_000)throw new Error(`shared_test_demo_evidence_artifact_size:${name}`);
    sources.push({path:`context/shared-test-${name}`,content:new TextDecoder().decode(bytes),sha256:artifact.sha256});
  }
  const proof=(await db.prepare(`SELECT proof_id,kind,content_type,public_sha256,public_url
    FROM test_proof_items WHERE run_id=? AND lease_id=? AND phase='first'
      AND classification='public_safe' AND sanitizer_result='passed' AND read_at IS NOT NULL
      AND body_marker IS NOT NULL AND projected_at IS NOT NULL AND public_sha256 IS NOT NULL
    ORDER BY kind,proof_id`).bind(work.run_id,lease.lease_id)
    .all<{proof_id:string;kind:string;content_type:string;public_sha256:string;public_url:string}>()).results;
  for(const item of proof) {
    if(item.public_url!==sharedTestProofUrl(item.proof_id))throw new Error('shared_test_demo_evidence_url_changed');
    const response=await fetcher(item.public_url,{redirect:'manual',signal:AbortSignal.timeout(20_000)});
    if(response.status!==200)throw new Error(`shared_test_demo_evidence_http:${response.status}`);
    const bytes=new Uint8Array(await response.arrayBuffer());
    const image=['app_screen','linear_screen'].includes(item.kind);
    if(bytes.byteLength>(image?8_000_000:2_000_000))throw new Error('shared_test_demo_evidence_size');
    const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))]
      .map(n=>n.toString(16).padStart(2,'0')).join('');
    if(digest!==item.public_sha256)throw new Error('shared_test_demo_evidence_hash_changed');
    const saved=await store.put(work.run_id,`shared-test-proof-${item.proof_id}`,bytes,item.content_type);
    await store.readBytes(saved.key,digest);
    evidence.push({id:`shared-test-${item.proof_id}`,kind:image?'browser_image':item.kind==='showboat'?'showboat':'provider_originated',
      caption:`Shared test ${item.kind}; lease ${lease.lease_id}; candidate ${work.pr_head_sha}`,
      sha256:digest,r2Key:saved.key,contentType:item.content_type,change:work.change_id,
      approvedDesignSha:work.approved_design_sha,testedBaseSha:work.tested_base_sha,treeSha:work.tree_sha!});
  }
  const index=JSON.stringify({leaseId:lease.lease_id,candidateCommit:work.pr_head_sha,
    planSource:'The inherited plan is historical; all listed evidence belongs to this candidate and completed lease.',
    proof:proof.map(p=>({id:`shared-test-${p.proof_id}`,kind:p.kind,url:p.public_url,sha256:p.public_sha256}))});
  sources.push({path:'context/shared-test-proof-index.json',content:index,sha256:await sha256Hex(index)});
  return {sources,evidence};
}
