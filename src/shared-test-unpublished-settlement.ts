import {sha256Hex} from './implementation-hash.ts';

/** Recovery for browser failures before review publication. Any review intent,
 * gate decision, unknown run, or unsettled request blocks this narrow path. */
export async function settleUnpublishedReview(env:Env & {IMPLEMENTATION_ENVIRONMENT_TOKEN?:string},
  runId:string,leaseId:string,request:typeof fetch=globalThis.fetch.bind(globalThis)) {
  const scenarios=(await env.DB.prepare(`SELECT scenario_run_id FROM test_review_scenarios
    WHERE lease_id=? ORDER BY scenario_id`).bind(leaseId).all<{scenario_run_id:string|null}>()).results;
  if(!scenarios.length)return null;
  if(scenarios.some(s=>!s.scenario_run_id))throw new Error('test_unpublished_scenario_allocation_uncertain');
  const guard=async()=>{
    const row=await env.DB.prepare(`SELECT l.candidate_commit,e.fence,r.worker_name,r.workflow_name,
      r.compiled_sha256,d.remote_id AS database_id,d.provider_key AS database_name
      FROM test_environment e JOIN test_leases l ON l.lease_id=e.owner_lease_id
      JOIN test_review_runtimes r ON r.lease_id=l.lease_id AND r.run_id=l.run_id
        AND r.attempt_id=l.attempt_id AND r.candidate_commit=l.candidate_commit
      JOIN test_resources d ON d.lease_id=l.lease_id AND d.run_id=l.run_id
        AND d.kind='d1_database' AND d.plan_state='created'
      WHERE e.site_id=1 AND e.state='quiescing' AND e.owner_run_id=? AND e.owner_lease_id=?
        AND e.fence=l.fence+1 AND l.state='quiescing'
        AND NOT EXISTS (SELECT 1 FROM test_review_provider_requests WHERE lease_id=? AND finished_at IS NULL)
        AND NOT EXISTS (SELECT 1 FROM test_github_transport_requests WHERE lease_id=? AND finished_at IS NULL)
        AND NOT EXISTS (SELECT 1 FROM agent_attempts WHERE run_id=? AND state IN ('pending','starting','running','collecting'))`)
      .bind(runId,leaseId,leaseId,leaseId,runId).first<{
        candidate_commit:string;fence:number;worker_name:string;workflow_name:string;
        compiled_sha256:string;database_id:string;database_name:string}>();
    if(!row)throw new Error('test_unpublished_not_quiescent');
    return row;
  };
  const subject=await guard(),suffix=leaseId.slice(0,32);
  if(subject.worker_name!==`deos-test-review-${suffix}` || subject.workflow_name!==subject.worker_name ||
      subject.database_name!==`deos-test-portal-db-${suffix}` || !/^[a-f0-9-]{36}$/.test(subject.database_id))
    throw new Error('test_unpublished_resource_scope_changed');
  const token=env.IMPLEMENTATION_ENVIRONMENT_TOKEN,account=env.IMPLEMENTATION_ENVIRONMENT_ACCOUNT_ID;
  if(!token||!/^[a-f0-9]{32}$/.test(account))throw new Error('test_unpublished_provider_missing');
  const api=async(path:string,init:RequestInit={})=>{
    const current=await guard();
    if(JSON.stringify(current)!==JSON.stringify(subject))throw new Error('test_unpublished_owner_changed');
    const response=await request(`https://api.cloudflare.com/client/v4/accounts/${account}${path}`,{
      ...init,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
      redirect:'manual',signal:AbortSignal.timeout(30_000)});
    const raw=await response.text();
    if(!response.ok)throw new Error(`Unpublished settlement ${path}: HTTP ${response.status}: ${raw.replaceAll(token,'[redacted]')}`);
    const value=JSON.parse(raw);
    if(value.success!==true)throw new Error(`Unpublished settlement ${path}: ${JSON.stringify(value.errors).replaceAll(token,'[redacted]')}`);
    return value.result;
  };
  const database=await api(`/d1/database/${subject.database_id}`);
  const workflow=await api(`/workflows/${subject.workflow_name}`);
  const settings=await api(`/workers/scripts/${subject.worker_name}/settings`);
  if(database.uuid!==subject.database_id||database.name!==subject.database_name ||
      workflow.name!==subject.workflow_name||workflow.script_name!==subject.worker_name||workflow.class_name!=='DeosWorkflow' ||
      ![`deos-review-lease:${leaseId}`,`deos-review-source:${subject.candidate_commit}`,
        `deos-review-build:${subject.compiled_sha256}`].every(tag=>settings.tags?.includes(tag)))
    throw new Error('test_unpublished_provider_identity_changed');
  const query=async<T>(sql:string):Promise<T[]>=>{
    const result=await api(`/d1/database/${subject.database_id}/query`,{method:'POST',body:JSON.stringify({sql})});
    if(!Array.isArray(result)||result.length!==1||result[0].success!==true||!Array.isArray(result[0].results))
      throw new Error('test_unpublished_query_failed');
    return result[0].results;
  };
  const checkEffects=async()=>{
    const facts=await query<{intents:number;decisions:number;operations:number}>(`SELECT (SELECT COUNT(*) FROM review_intents) AS intents,
    (SELECT COUNT(*) FROM human_gate_visits WHERE state<>'open') AS decisions,
    (SELECT COUNT(*) FROM provider_operations WHERE capability<>'fixture_input') AS operations`);
  if(facts.length!==1||facts[0].intents!==0||facts[0].decisions!==0||facts[0].operations!==0)
      throw new Error('test_unpublished_review_effects_present');
    return facts;
  };
  const facts=await checkEffects();
  const runs=await query<{run_id:string;workflow_instance_id:string}>('SELECT run_id,workflow_instance_id FROM orchestration_runs ORDER BY run_id');
  if(runs.length!==scenarios.length || new Set(runs.map(r=>r.workflow_instance_id)).size!==runs.length ||
      runs.some(r=>!scenarios.some(s=>s.scenario_run_id===r.run_id)||
        typeof r.workflow_instance_id!=='string'||!/^wf-v1-[a-z0-9]+$/.test(r.workflow_instance_id)))
    throw new Error('test_unpublished_run_scope_changed');
  const statuses=[];
  for(const run of runs) {
    const path=`/workflows/${subject.workflow_name}/instances/${run.workflow_instance_id}`;
    const before=await api(path);
    if(!['complete','errored','terminated'].includes(before.status))
      await api(path+'/status',{method:'PATCH',body:JSON.stringify({status:'terminate'})});
    const first=await api(path),second=await api(path);
    if(!['complete','errored','terminated'].includes(first.status)||first.status!==second.status)
      throw new Error('test_unpublished_workflow_not_settled');
    statuses.push({runId:run.run_id,instanceId:run.workflow_instance_id,before,first,second});
  }
  const settledFacts=await checkEffects();
  const evidence=JSON.stringify({version:1,runId,leaseId,subject,facts,settledFacts,statuses});
  if(new TextEncoder().encode(evidence).length>20_000_000)throw new Error('test_unpublished_evidence_too_large');
  const digest=await sha256Hex(evidence),key=`shared-test/failed/${leaseId}/unpublished/${digest}.json`;
  await env.ARTIFACTS.put(key,evidence,{onlyIf:{etagDoesNotMatch:'*'},customMetadata:{evidenceClass:'private-failure'}});
  const read=await env.ARTIFACTS.get(key);
  if(!read||await sha256Hex(await read.text())!==digest)throw new Error('test_unpublished_evidence_changed');
  await guard();
  await env.DB.prepare(`INSERT INTO test_review_unpublished_settlements VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(lease_id) DO NOTHING`).bind(leaseId,runId,subject.candidate_commit,subject.fence,key,digest,new Date().toISOString()).run();
  const saved=await env.DB.prepare('SELECT * FROM test_review_unpublished_settlements WHERE lease_id=?').bind(leaseId)
    .first<{run_id:string;candidate_commit:string;cleanup_fence:number;evidence_key:string;evidence_sha256:string}>();
  if(!saved||saved.run_id!==runId||saved.candidate_commit!==subject.candidate_commit||saved.cleanup_fence!==subject.fence)
    throw new Error('test_unpublished_settlement_changed');
  const retained=await env.ARTIFACTS.get(saved.evidence_key);
  if(!retained||await sha256Hex(await retained.text())!==saved.evidence_sha256)
    throw new Error('test_unpublished_evidence_changed');
  return saved;
}
