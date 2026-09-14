import { loadWorkflowDefinition, restoreWorkflowDefinition, type LoadedWorkflowDefinition } from "./workflow-definition.ts";
import { D1OrchestrationStore, type OrchestrationRunRecord } from "./orchestration-store.ts";
import { D1HumanGateStore, type HumanGateVisitRecord } from "./human-gate-store.ts";
import { LinearCapabilityAdapter } from "./linear-capability.ts";
import { implementationGitHub, type ImplementationPull } from "./implementation-github.ts";
import { workflowInstanceIdentity } from "./orchestration-identity.ts";
import { sha256Hex } from "./implementation-hash.ts";
import { recordCaughtError } from "./error-context.ts";
import { ImplementationProviderTest } from "./implementation-provider-test.ts";

const stable = (value: unknown): string => JSON.stringify(value, (_key, item: unknown) =>
  item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);

// Build from the saved source, not from today's planning/design template.
export async function implementationHandoffDefinition(source: LoadedWorkflowDefinition,
  tail: LoadedWorkflowDefinition, version: number): Promise<LoadedWorkflowDefinition> {
  if (source.implementationPolicy || source.nodes.design_review?.type !== "human_gate" ||
    source.nodes.merge_design_pr?.type !== "system_action" ||
    source.nodes.merge_design_pr.action !== "github.merge_design_pull_request" ||
    source.nodes.merge_design_pr.edges.completed !== "done" ||
    source.nodes.done?.type !== "terminal" || source.nodes.done.outcome !== "succeeded" ||
    !tail.implementationPolicy || tail.name !== "implementation" || version <= tail.version)
    throw new Error("implementation_handoff_incompatible_definition");
  const jobs = { ...source.jobs }, nodes = { ...source.nodes };
  for (const [id, job] of Object.entries(tail.jobs)) if (id.startsWith("implementation_")) {
    if (jobs[id]) throw new Error("implementation_handoff_job_collision");
    jobs[id] = job;
  }
  for (const [id, node] of Object.entries(tail.nodes)) if (id.startsWith("implementation_") || id === "code_merged") {
    if (nodes[id]) throw new Error("implementation_handoff_node_collision");
    nodes[id] = node;
  }
  nodes.merge_design_pr = { ...source.nodes.merge_design_pr,
    edges: { ...source.nodes.merge_design_pr.edges, completed: "implementation_prepare" } };
  const prompts: Record<string, string> = {}, schemas: Record<string, string> = {};
  const jobSources = Object.fromEntries(Object.entries(jobs).map(([id, job]) => {
    const { id: _id, prompt, resultSchemaFile, resultSchema, operation, ...rest } = job;
    prompts[job.promptFile] = prompt;
    schemas[resultSchemaFile] = JSON.stringify(resultSchema);
    return [id, { ...rest, resultSchema: resultSchemaFile, ...(operation ? { operation } : {}) }];
  }));
  const nodeSources = Object.fromEntries(Object.entries(nodes).map(([id, node]) => {
    const { id: _id, ...rest } = node;
    if (node.type === "terminal") return [id, { type: node.type, deosStatus: node.outcome, executorAction: "return" }];
    if (node.type === "failure") return [id, { type: node.type, deosStatus: node.deosStatus,
      executorAction: node.executorAction, cause: node.cause }];
    return [id, rest];
  }));
  const target = await loadWorkflowDefinition(JSON.stringify({ apiVersion: source.apiVersion, kind: source.kind,
    metadata: { name: "implementation", version }, spec: { start: source.start, execution: source.execution,
      jobs: jobSources, nodes: nodeSources, implementationPolicy: tail.implementationPolicy } }), { prompts, schemas });
  for (const [id, job] of Object.entries(source.jobs))
    if (stable(target.jobs[id]) !== stable(job)) throw new Error(`implementation_handoff_changed_job:${id}`);
  for (const [id, node] of Object.entries(source.nodes))
    if (stable(target.nodes[id]) !== stable(id === "merge_design_pr" ? nodes[id] : node))
      throw new Error(`implementation_handoff_changed_node:${id}`);
  return target;
}

export interface HandoffInput {
  version: 1; runId: string; sourceWorkflowInstanceId: string; sourceDefinitionDigest: string;
  visitSequence: number; designHeadSha: string; humanUserId: string; targetVersion: number;
  requestedBy: string; execute?: boolean; planDigest?: string;
}
interface HandoffRecord {
  handoff_id: string; run_id: string; plan_digest: string; plan_json: string;
  state: "prepared" | "applied" | "established"; target_workflow_instance_id: string;
}
interface HandoffPlan {
  input: HandoffInput; source: { name: string; version: number; digest: string };
  target: { name: string; version: number; digest: string }; gate: HumanGateVisitRecord;
  targetWorkflowInstanceId: string; sourceDeliveryId: string; humanBindingRevision: number;
  allowedAccessEmail: string;
  human: { id: string; email: string; active: boolean; isMe: boolean };
}
interface HandoffProviders {
  issue(run: OrchestrationRunRecord): Promise<Record<string, unknown>>;
  human(id: string): Promise<HandoffPlan["human"]>;
  pull(run: OrchestrationRunRecord, gate: HumanGateVisitRecord): Promise<ImplementationPull>;
}

export class ImplementationHandoffController {
  readonly env: Env;
  readonly tail: LoadedWorkflowDefinition;
  readonly providers: HandoffProviders;
  constructor(env: Env, tail: LoadedWorkflowDefinition, providers?: HandoffProviders) {
    this.env = env; this.tail = tail;
    const linear = new LinearCapabilityAdapter(env.LINEAR_API_URL, env.LINEAR_APP_ACCESS_TOKEN);
    this.providers = providers ?? {
      issue: run => linear.implementationContext(run.issue_id), human: id => linear.implementationUser(id),
      pull: (run, gate) => implementationGitHub(env, run).json<ImplementationPull>(`/pulls/${gate.pull_request_number}`),
    };
  }
  async handle(request: Request): Promise<Response> {
    if (request.method !== "POST") return Response.json({ error: "method_not_allowed" }, { status: 405 });
    if (!this.env.STAGE_RETRY_SECRET || request.headers.get("Authorization") !== `Bearer ${this.env.STAGE_RETRY_SECRET}`)
      return Response.json({ error: "invalid_operator_capability" }, { status: 401 });
    const value: unknown = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_handoff_request");
    const input = value as HandoffInput;
    if (Object.keys(input).some(key => !["version", "runId", "sourceWorkflowInstanceId", "sourceDefinitionDigest",
      "visitSequence", "designHeadSha", "humanUserId", "targetVersion", "requestedBy", "execute", "planDigest"].includes(key)) ||
      input.version !== 1 || typeof input.runId !== "string" || !/^wf-v1-[a-z2-7]+$/.test(input.sourceWorkflowInstanceId) ||
      !/^[a-f0-9]{64}$/.test(input.sourceDefinitionDigest) || !/^[a-f0-9]{40}$/.test(input.designHeadSha) ||
      !Number.isSafeInteger(input.visitSequence) || input.visitSequence < 1 ||
      !Number.isSafeInteger(input.targetVersion) || input.targetVersion <= this.tail.version ||
      !/^[a-zA-Z0-9._@-]{1,100}$/.test(input.requestedBy) || typeof input.humanUserId !== "string" ||
      (input.execute !== undefined && typeof input.execute !== "boolean")) throw new Error("invalid_handoff_request");
    const identityInput = { ...input }; delete identityInput.execute; delete identityInput.planDigest;
    const id = `implementation-handoff:${input.sourceWorkflowInstanceId}`;
    const existing = await this.env.DB.prepare("SELECT * FROM implementation_handoffs WHERE handoff_id=?")
      .bind(id).first<HandoffRecord>();
    if (existing) {
      const saved = JSON.parse(existing.plan_json) as HandoffPlan;
      if (stable(saved.input) !== stable(identityInput)) throw new Error("implementation_handoff_identity_mismatch");
      if (input.execute && input.planDigest !== existing.plan_digest) throw new Error("implementation_handoff_plan_mismatch");
      if (existing.state !== "prepared") return input.execute
        ? this.establish(existing, saved)
        : Response.json({ handoffId: id, state: existing.state, planDigest: existing.plan_digest, plan: saved });
    }
    const run = await new D1OrchestrationStore(this.env.DB).findRun(input.runId);
    if (!run || run.status !== "awaiting_human" || run.current_node !== "design_review" ||
      run.current_visit_sequence !== input.visitSequence || run.workflow_instance_id !== input.sourceWorkflowInstanceId ||
      run.definition_digest !== input.sourceDefinitionDigest) throw new Error("implementation_handoff_gate_changed");
    const gate = await new D1HumanGateStore(this.env.DB).find(run.run_id, input.visitSequence);
    if (!gate || gate.state !== "open" || gate.gate_kind !== "design" || gate.approved_head_sha !== input.designHeadSha ||
      gate.repository !== run.route_repository) throw new Error("implementation_handoff_subject_changed");
    const active = await this.env.DB.prepare("SELECT attempt_id FROM agent_attempts WHERE run_id=? AND state IN ('pending','starting','running','collecting') LIMIT 1")
      .bind(run.run_id).first();
    if (active) throw new Error("implementation_handoff_active_attempt");
    const issue = await this.providers.issue(run);
    if ((issue.state as { id: string })?.id !== run.route_human_gate_state_id) throw new Error("implementation_handoff_linear_gate_changed");
    const human = await this.providers.human(input.humanUserId);
    if (!human.active || human.isMe || human.id !== input.humanUserId)
      throw new Error("implementation_handoff_human_not_checked");
    const pull = await this.providers.pull(run, gate);
    if (pull.state !== "open" || pull.merged || pull.head.sha !== gate.approved_head_sha || pull.base.ref !== gate.base_branch)
      throw new Error("implementation_handoff_github_subject_changed");
    const stored = await new D1OrchestrationStore(this.env.DB).findDefinitionSnapshot(run.definition_id, run.definition_version);
    if (!stored) throw new Error("implementation_handoff_source_missing");
    const source = await restoreWorkflowDefinition(stored.canonical_json, run.definition_digest);
    const testProfile = await this.env.DB.prepare("SELECT run_id FROM implementation_test_profiles WHERE run_id=?")
      .bind(run.run_id).first();
    const tail = testProfile ? { ...this.tail, implementationPolicy: { ...this.tail.implementationPolicy!,
      safeAdapters: [(await new ImplementationProviderTest(this.env).profile(run.run_id)).row.adapter_binding] } } : this.tail;
    const target = await implementationHandoffDefinition(source, tail, input.targetVersion);
    const intent = await this.env.DB.prepare("SELECT source_delivery_id FROM dispatch_intents WHERE run_id=? AND workflow_instance_id=?")
      .bind(run.run_id, run.workflow_instance_id).first<{ source_delivery_id: string }>();
    if (!intent) throw new Error("implementation_handoff_dispatch_missing");
    const plan: HandoffPlan = { input: identityInput, source: { name: source.name, version: source.version, digest: source.digest },
      target: { name: target.name, version: target.version, digest: target.digest }, gate,
      targetWorkflowInstanceId: await workflowInstanceIdentity(`${run.run_id}:implementation-handoff:${input.visitSequence + 1}`),
      sourceDeliveryId: run.selection_delivery_id ?? intent.source_delivery_id,
      allowedAccessEmail: this.env.ROUTE_ADMIN_ALLOWED_EMAIL.toLowerCase(),
      humanBindingRevision: (run.human_binding_revision ?? 0) + 1, human };
    const planJson = stable(plan), digest = await sha256Hex(planJson);
    if (existing && digest !== existing.plan_digest) throw new Error("implementation_handoff_plan_changed");
    if (!input.execute) return Response.json({ ready: true, planDigest: digest, plan });
    if (input.planDigest !== digest) throw new Error("implementation_handoff_plan_mismatch");
    await new D1OrchestrationStore(this.env.DB).registerDefinition({ definition: target, projectId: run.project_id, now: new Date().toISOString() });
    await this.env.DB.prepare(`INSERT OR IGNORE INTO implementation_handoffs
      (handoff_id,run_id,plan_digest,plan_json,state,target_workflow_instance_id,created_at,updated_at)
      VALUES (?,?,?,?,'prepared',?,?,?)`).bind(id, run.run_id, digest, planJson, plan.targetWorkflowInstanceId,
        new Date().toISOString(), new Date().toISOString()).run();
    const sourceInstance = await this.env.ORCHESTRATION_WORKFLOW.get(run.workflow_instance_id);
    const sourceStatus = (await sourceInstance.status()).status;
    if (sourceStatus !== "paused") {
      if (!["waiting", "paused", "running"].includes(sourceStatus)) throw new Error(`implementation_handoff_source_status:${sourceStatus}`);
      await sourceInstance.pause();
      if ((await sourceInstance.status()).status !== "paused") throw new Error("implementation_handoff_source_not_paused");
    }
    try {
      await this.apply(id, run, plan, digest);
    } catch (error) {
      // Resume the source only when D1 proves that the handoff did not commit.
      try {
        const after = await new D1OrchestrationStore(this.env.DB).findRun(run.run_id);
        if (after?.workflow_instance_id === run.workflow_instance_id) await sourceInstance.resume();
      } catch (secondary) {
        throw new AggregateError([error, secondary], "Implementation handoff and source recovery failed", { cause: error });
      }
      throw error;
    }
    return this.establish({ handoff_id: id, run_id: run.run_id, plan_digest: digest, plan_json: planJson,
      state: "applied", target_workflow_instance_id: plan.targetWorkflowInstanceId }, plan);
  }

  private async apply(id: string, run: OrchestrationRunRecord, plan: HandoffPlan, digest: string) {
    const db = this.env.DB, now = new Date().toISOString(), transitionId = `transition:${id}`;
    await db.batch([
      db.prepare(`UPDATE orchestration_runs SET definition_id=?,definition_version=?,definition_digest=?,
        workflow_instance_id=?,previous_node=current_node,current_visit_sequence=current_visit_sequence+1,
        last_transition_id=?,allowed_linear_user_id=?,human_binding_revision=?,updated_at=?
        WHERE run_id=? AND workflow_instance_id=? AND definition_digest=? AND current_visit_sequence=?
        AND current_node='design_review' AND status='awaiting_human'
        AND EXISTS(SELECT 1 FROM human_gate_visits g WHERE g.run_id=orchestration_runs.run_id
          AND g.visit_sequence=orchestration_runs.current_visit_sequence AND g.state='open' AND g.approved_head_sha=?)
        AND EXISTS(SELECT 1 FROM implementation_handoffs h WHERE h.handoff_id=? AND h.plan_digest=? AND h.state='prepared')
        AND NOT EXISTS(SELECT 1 FROM agent_attempts a WHERE a.run_id=orchestration_runs.run_id
          AND a.state IN ('pending','starting','running','collecting'))
        AND NOT EXISTS(SELECT 1 FROM workflow_event_inbox e WHERE e.run_id=orchestration_runs.run_id
          AND e.actor_type='user' AND e.state IN ('pending','sent','claimed'))`)
        .bind(plan.target.name, plan.target.version, plan.target.digest, plan.targetWorkflowInstanceId, transitionId,
          plan.human.id, plan.humanBindingRevision, now, run.run_id, run.workflow_instance_id, run.definition_digest,
          run.current_visit_sequence, plan.gate.approved_head_sha, id, digest),
      db.prepare(`INSERT INTO human_gate_visits
        (run_id,visit_sequence,node_id,gate_kind,work_type,work_product_kind,round,state,repository,pull_request_database_id,
         pull_request_number,pull_request_url,head_branch,base_branch,approved_head_sha,created_at)
        SELECT g.run_id,g.visit_sequence+1,g.node_id,g.gate_kind,g.work_type,g.work_product_kind,g.round,'open',g.repository,
          g.pull_request_database_id,g.pull_request_number,g.pull_request_url,g.head_branch,g.base_branch,g.approved_head_sha,g.created_at
        FROM human_gate_visits g JOIN orchestration_runs r ON r.run_id=g.run_id
        WHERE g.run_id=? AND g.visit_sequence=? AND r.last_transition_id=? AND r.workflow_instance_id=?`)
        .bind(run.run_id, run.current_visit_sequence, transitionId, plan.targetWorkflowInstanceId),
      db.prepare(`UPDATE dispatch_intents SET workflow_instance_id=?,updated_at=? WHERE run_id=? AND workflow_instance_id=?
        AND EXISTS(SELECT 1 FROM orchestration_runs r WHERE r.run_id=dispatch_intents.run_id AND r.last_transition_id=?)`)
        .bind(plan.targetWorkflowInstanceId, now, run.run_id, run.workflow_instance_id, transitionId),
      db.prepare(`INSERT INTO workflow_transitions_v2
        (transition_id,run_id,from_node,to_node,from_visit_sequence,to_visit_sequence,cause_type,cause_reference,
         actor_id,actor_type,provider_operation_id,occurred_at)
        SELECT ?,run_id,'design_review','design_review',?,current_visit_sequence,'operator_retry',?,?,'operator',NULL,?
        FROM orchestration_runs WHERE run_id=? AND last_transition_id=?`)
        .bind(transitionId, run.current_visit_sequence, id, plan.input.requestedBy, now, run.run_id, transitionId),
      db.prepare(`UPDATE implementation_handoffs SET state='applied',updated_at=? WHERE handoff_id=? AND state='prepared'
        AND EXISTS(SELECT 1 FROM orchestration_runs r WHERE r.run_id=implementation_handoffs.run_id AND r.last_transition_id=?)`)
        .bind(now, id, transitionId),
    ]);
    const after = await db.prepare("SELECT state FROM implementation_handoffs WHERE handoff_id=?").bind(id).first<{ state: string }>();
    if (after?.state !== "applied") throw new Error("implementation_handoff_compare_and_set_failed");
  }

  private async establish(record: HandoffRecord, plan: HandoffPlan): Promise<Response> {
    if (record.state !== "established") {
      const source = await this.env.ORCHESTRATION_WORKFLOW.get(plan.input.sourceWorkflowInstanceId);
      if ((await source.status()).status !== "terminated") await source.terminate();
      if ((await source.status()).status !== "terminated") throw new Error("implementation_handoff_source_not_terminated");
      try {
        await this.env.ORCHESTRATION_WORKFLOW.createBatch([{ id: plan.targetWorkflowInstanceId,
          params: { runId: record.run_id, sourceDeliveryId: plan.sourceDeliveryId } }]);
      } catch (error) {
        // A deterministic ID lets read-back settle a duplicate or lost create response.
        recordCaughtError(error, "implementation_handoff.create_replacement");
        const instance = await this.env.ORCHESTRATION_WORKFLOW.get(plan.targetWorkflowInstanceId);
        try { await instance.status(); } catch (readError) {
          throw new AggregateError([error, readError], "Implementation handoff replacement could not be read", { cause: error });
        }
      }
    }
    const instance = await this.env.ORCHESTRATION_WORKFLOW.get(plan.targetWorkflowInstanceId);
    const status = (await instance.status()).status;
    if (!["queued", "running", "waiting", "paused"].includes(status)) throw new Error(`implementation_handoff_target_status:${status}`);
    // A dispatcher can have read the old instance just before the handoff.
    // Forward saved, unconsumed deliveries after stopping that instance.
    const inbox = await this.env.DB.prepare(`SELECT delivery_id FROM workflow_event_inbox
      WHERE run_id=? AND state IN ('pending','sent') AND julianday(provider_time)>=julianday(?) ORDER BY provider_time`)
      .bind(record.run_id, plan.gate.created_at).all<{ delivery_id: string }>();
    for (const event of inbox.results) await instance.sendEvent({ type: "linear-event", payload: { deliveryId: event.delivery_id } });
    await this.env.DB.prepare("UPDATE implementation_handoffs SET state='established',updated_at=? WHERE handoff_id=?")
      .bind(new Date().toISOString(), record.handoff_id).run();
    return Response.json({ handoffId: record.handoff_id, state: "established", workflowStatus: status, planDigest: record.plan_digest, plan });
  }
}
