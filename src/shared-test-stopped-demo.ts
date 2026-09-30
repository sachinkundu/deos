import {D1OrchestrationStore} from './orchestration-store.ts';
import {D1AgentAttemptStore} from './sandbox-controller.ts';
import {requireSandboxTier} from './sandbox-tier.ts';
import {restoreWorkflowDefinition} from './workflow-definition.ts';

/** Collect an already-stopped orphan after its parent workflow has ended.
 * This cannot stop, restart, replace, or mark an agent successful. */
export async function collectStoppedSharedTestDemo(request:Request,env:Env):Promise<Response> {
  if(request.method!=='POST')return Response.json({error:'method_not_allowed'},{status:405});
  if(!env.STAGE_RETRY_SECRET || request.headers.get('Authorization')!==`Bearer ${env.STAGE_RETRY_SECRET}`)
    return Response.json({error:'invalid_operator_capability'},{status:401});
  const input=await request.json() as Record<string,unknown>;
  if(!input || Object.keys(input).sort().join(',')!=='attemptId,candidateCommit,fence,leaseId,runId,version' ||
      input.version!==1 || ![input.runId,input.attemptId].every(v=>typeof v==='string'&&v.length>0) ||
      typeof input.leaseId!=='string' || !/^[a-f0-9]{64}$/.test(input.leaseId) ||
      typeof input.candidateCommit!=='string' || !/^[a-f0-9]{40}$/.test(input.candidateCommit) ||
      !Number.isSafeInteger(input.fence))throw new Error('test_stopped_demo_request_invalid');
  const runId=input.runId as string,attemptId=input.attemptId as string;
  const owner=await env.DB.prepare(`SELECT 1 AS ready FROM test_environment e
    JOIN test_leases l ON l.lease_id=e.owner_lease_id AND l.run_id=e.owner_run_id
    WHERE e.site_id=1 AND ((e.state='active' AND l.state='active' AND e.fence=l.fence)
      OR (e.state='quiescing' AND e.saved_phase='active' AND l.state='quiescing' AND e.fence=l.fence+1))
      AND l.run_id=? AND l.lease_id=? AND l.attempt_id=? AND l.candidate_commit=?
      AND l.fence=?
      AND NOT EXISTS (SELECT 1 FROM agent_attempts x WHERE x.run_id=l.run_id
        AND x.attempt_id<>l.attempt_id AND x.state IN ('pending','starting','running','collecting'))`)
    .bind(runId,input.leaseId,attemptId,input.candidateCommit,input.fence).first();
  const store=new D1OrchestrationStore(env.DB),run=await store.findRun(runId);
  const attempt=await new D1AgentAttemptStore(env.DB).findLatest(runId,'shared_test_demo');
  if(!owner || !run || !['failed','canceled','blocked'].includes(run.status) ||
      !attempt || attempt.attempt_id!==attemptId || !attempt.process_id)
    throw new Error('test_stopped_demo_subject_not_ready');
  if(['failed','interrupted','absolute_timeout'].includes(attempt.state) && attempt.manifest_id)
    return Response.json({state:attempt.state,attemptId,manifestId:attempt.manifest_id});
  if(!['running','collecting'].includes(attempt.state))throw new Error('test_stopped_demo_attempt_changed');
  const {CloudflareSandboxFactory}=await import('./sandbox-platform.ts');
  const sandbox=new CloudflareSandboxFactory(env.Sandbox,env.Standard2Sandbox,
    env.ImplementationSandbox,env.ImplementationStandard2Sandbox)
    .get(attempt.sandbox_id,{keepAlive:true,tier:requireSandboxTier(attempt.sandbox_tier)});
  const process=await sandbox.getProcess(attempt.process_id);
  if(!process)throw new Error('test_stopped_demo_process_missing');
  const status=await process.status();
  if(status.state==='running' || (status.state!=='error' && status.exit?.code===0))
    throw new Error('test_stopped_demo_failure_not_observed');
  const snapshot=await store.findDefinitionSnapshot(run.definition_id,run.definition_version);
  if(!snapshot)throw new Error('test_stopped_demo_definition_missing');
  const definition=await restoreWorkflowDefinition(snapshot.canonical_json,run.definition_digest);
  const job=JSON.parse(attempt.job_spec_json) as {jobId:string;requiredOutputs:string[]};
  if(job.jobId!=='shared_test_agent' || !definition.jobs[job.jobId] ||
      JSON.stringify(job.requiredOutputs)!==JSON.stringify(definition.jobs[job.jobId].requiredOutputs))
    throw new Error('test_stopped_demo_job_changed');
  const {CloudflareWorkflowServices}=await import('./workflow-services.ts');
  const observation=await new CloudflareWorkflowServices(env,definition)
    .collectStoppedSharedTest(run,attemptId,definition);
  return Response.json(observation);
}
