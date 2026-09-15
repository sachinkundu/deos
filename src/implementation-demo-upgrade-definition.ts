import { loadWorkflowDefinition, type LoadedWorkflowDefinition } from './workflow-definition.ts';

const stable = (value: unknown): string => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b))) : item);

export function validateDemoUpgrade(source: LoadedWorkflowDefinition, target: LoadedWorkflowDefinition): void {
  if (source.name !== 'implementation' || target.name !== source.name || !source.implementationPolicy ||
      !target.jobs.implementation_demo_plan || !target.jobs.implementation_demo_gate ||
      target.version <= source.version || stable(source.implementationPolicy) !== stable(target.implementationPolicy) ||
      stable(source.execution) !== stable(target.execution) || source.start !== target.start)
    throw new Error('implementation_demo_upgrade_incompatible');
  for (const [id, job] of Object.entries(source.jobs)) {
    const next = target.jobs[id];
    if (!id.startsWith('implementation_')) {
      if (stable(next) !== stable(job)) throw new Error(`implementation_demo_upgrade_changed_job:${id}`);
    } else {
      const {prompt: _prompt, ...original} = job;
      const {prompt: _nextPrompt, ...updated} = next ?? {};
      if (stable(original) !== stable(updated)) throw new Error(`implementation_demo_upgrade_changed_job_contract:${id}`);
    }
  }
  for (const [id, node] of Object.entries(source.nodes)) if (!id.startsWith('implementation_') && stable(target.nodes[id]) !== stable(node))
    throw new Error(`implementation_demo_upgrade_changed_history:${id}`);
  // Human decisions and publication ordering must remain explicit.
  if (target.nodes.implementation_demo_plan.edges.ready !== 'implementation_build' ||
      target.nodes.implementation_proof_check.edges.completed !== 'implementation_demo_gate' ||
      target.nodes.implementation_demo_gate.edges.pass !== 'implementation_branch_write' ||
      target.nodes.implementation_demo_gate.edges.needs_work !== 'implementation_build' ||
      stable(target.nodes.implementation_review) !== stable(source.nodes.implementation_review))
    throw new Error('implementation_demo_upgrade_changed_gate');
}

export async function implementationDemoUpgradeDefinition(source: LoadedWorkflowDefinition, tail: LoadedWorkflowDefinition, version: number) {
  if (version <= Math.max(source.version, tail.version)) throw new Error('implementation_demo_upgrade_version');
  const jobs = {...source.jobs}, nodes = {...source.nodes};
  for (const [id, job] of Object.entries(tail.jobs)) if (id.startsWith('implementation_'))
    jobs[id] = source.jobs[id] ? {...source.jobs[id], prompt:job.prompt} : job;
  for (const [id, node] of Object.entries(tail.nodes)) if (id.startsWith('implementation_')) nodes[id] = node;
  const prompts: Record<string,string> = {}, schemas: Record<string,string> = {};
  const jobSources = Object.fromEntries(Object.entries(jobs).map(([id, job]) => {
    const {id:_id,prompt,resultSchemaFile,resultSchema,operation,...rest}=job;
    prompts[job.promptFile]=prompt;schemas[resultSchemaFile]=JSON.stringify(resultSchema);
    return [id,{...rest,resultSchema:resultSchemaFile,...(operation?{operation}:{})}];
  }));
  const nodeSources=Object.fromEntries(Object.entries(nodes).map(([id,node])=>{
    const {id:_id,...rest}=node;
    return [id,node.type==='terminal'?{type:node.type,deosStatus:node.outcome,executorAction:'return'}
      :node.type==='failure'?{type:node.type,deosStatus:node.deosStatus,executorAction:node.executorAction,cause:node.cause}:rest];
  }));
  const target=await loadWorkflowDefinition(JSON.stringify({apiVersion:source.apiVersion,kind:source.kind,
    metadata:{name:source.name,version},spec:{start:source.start,execution:source.execution,
      implementationPolicy:source.implementationPolicy,jobs:jobSources,nodes:nodeSources}}),{prompts,schemas});
  validateDemoUpgrade(source,target);
  return target;
}
