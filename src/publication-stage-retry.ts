import { D1AgentStageRetryStore, type AgentStageRetryRecord, type AgentStageRetryStore } from "./stage-retry.ts";
import { isPublicationRetryNode, publicationRetryActions, publicationRetryFailure } from "./stage-retry-contract.ts";
import { workflowInstanceIdentity } from "./orchestration-identity.ts";
import { restoreWorkflowDefinition, type LoadedWorkflowDefinition } from "./workflow-definition.ts";
import { implementationDemoUpgradeDefinition } from "./implementation-demo-upgrade-definition.ts";
import { D1OrchestrationStore } from "./orchestration-store.ts";

/** Shares dispatch reconciliation with agent retries, but identifies a failed system visit. */
export class D1StageRetryStore implements AgentStageRetryStore {
  private readonly agents: D1AgentStageRetryStore;
  private readonly db: D1Database;
  private readonly implementationTail?: LoadedWorkflowDefinition;
  constructor(db: D1Database, implementationTail?: LoadedWorkflowDefinition) {
    this.db = db; this.agents = new D1AgentStageRetryStore(db); this.implementationTail = implementationTail;
  }

  private find(failureId: string): Promise<AgentStageRetryRecord | null> {
    return this.db.prepare(`SELECT retry.*, run.current_node, run.current_visit_sequence,
      run.status AS run_status, run.workflow_instance_id
      FROM publication_stage_retries retry JOIN orchestration_runs run ON run.run_id = retry.run_id
      WHERE retry.failed_attempt_id = ?`).bind(failureId).first<AgentStageRetryRecord>();
  }

  async prepare(input: Parameters<AgentStageRetryStore["prepare"]>[0]): Promise<AgentStageRetryRecord> {
    if (!isPublicationRetryNode(input.retryNode)) return this.agents.prepare(input);
    const failure = publicationRetryFailure(input.retryNode);
    const existing = await this.find(input.failedAttemptId);
    if (existing) {
      if (existing.run_id !== input.runId || existing.retry_node !== input.retryNode)
        throw new Error("stage_retry_identity_mismatch");
      if (existing.state === "pending" && (existing.run_status !== "active" ||
          existing.current_node !== existing.retry_node ||
          existing.current_visit_sequence !== existing.to_visit_sequence))
        throw new Error("stage_retry_not_eligible");
      return existing;
    }
    const source = await this.db.prepare(`SELECT run.*, definition.canonical_json,
        COALESCE(run.selection_delivery_id, intent.source_delivery_id) AS source_delivery_id
      FROM orchestration_runs run
      JOIN workflow_definitions definition ON definition.definition_id = run.definition_id
        AND definition.version = run.definition_version AND definition.digest = run.definition_digest
      JOIN dispatch_intents intent ON intent.run_id = run.run_id
        AND intent.workflow_instance_id = run.workflow_instance_id
      JOIN workflow_transitions_v2 failure ON failure.transition_id = run.last_transition_id
        AND failure.run_id = run.run_id AND failure.to_visit_sequence = run.current_visit_sequence
        AND failure.from_visit_sequence = run.current_visit_sequence - 1
      WHERE run.run_id = ? AND run.status = 'failed' AND run.current_node = ?
        AND run.terminal_cause = ?
        AND failure.transition_id = ? AND failure.from_node = ?
        AND failure.to_node = ? AND failure.cause_reference = ?`)
      .bind(input.runId, failure.node, failure.cause, input.failedAttemptId, input.retryNode, failure.node,
        `system:${publicationRetryActions[input.retryNode]}:failed`)
      .first<{ definition_id: string; definition_version: number; definition_digest: string;
        canonical_json: string; current_visit_sequence: number; workflow_instance_id: string; project_id:string;
        source_delivery_id: string | null }>();
    if (!source?.source_delivery_id) throw new Error("stage_retry_not_eligible");
    const definition = await restoreWorkflowDefinition(source.canonical_json, source.definition_digest);
    const node = definition.nodes[input.retryNode];
    if (node?.type !== "system_action" || node.action !== publicationRetryActions[input.retryNode] ||
        node.edges.failed !== failure.node) throw new Error("stage_retry_not_eligible");
    let target = definition;
    if (definition.name === 'implementation' && this.implementationTail &&
        definition.version < this.implementationTail.version &&
        this.implementationTail.nodes.implementation_publication_wait?.edges.reply_received === 'implementation_build') {
      const active = await this.db.prepare(`SELECT 1 FROM agent_attempts WHERE run_id=? AND state IN ('pending','starting','running','collecting')
        UNION ALL SELECT 1 FROM implementation_gates WHERE run_id=? AND state='open' LIMIT 1`)
        .bind(input.runId,input.runId).first();
      if (active) throw new Error('stage_retry_not_eligible');
      const maximum = await this.db.prepare("SELECT MAX(version) AS version FROM workflow_definitions WHERE definition_id='implementation'")
        .first<{version:number|null}>();
      target = await implementationDemoUpgradeDefinition(definition,this.implementationTail,
        Math.max(definition.version,this.implementationTail.version,maximum?.version ?? 0)+1);
      await new D1OrchestrationStore(this.db).registerDefinition({definition:target,projectId:source.project_id,now:input.now});
    }
    const retryKind = target.digest === definition.digest ? 'same_definition' : 'compatible_tail';
    const retryId = `publication-retry:${input.failedAttemptId}`;
    const transitionId = `transition:${retryId}`;
    const targetId = await workflowInstanceIdentity(`${input.runId}:publication-retry:${source.current_visit_sequence + 1}`);
    const results = await this.db.batch([
      this.db.prepare(`INSERT OR IGNORE INTO publication_stage_retries
        (retry_id,run_id,failed_attempt_id,retry_node,from_visit_sequence,to_visit_sequence,
         transition_id,state,requested_by,created_at,updated_at,retry_kind,
         source_definition_id,source_definition_version,source_definition_digest,
         target_definition_id,target_definition_version,target_definition_digest,
         source_workflow_instance_id,target_workflow_instance_id,source_delivery_id)
        SELECT ?,run_id,?,?,current_visit_sequence,current_visit_sequence+1,?,'pending',?,?,?,
          ?,definition_id,definition_version,definition_digest,
          ?,?,?,workflow_instance_id,?,?
        FROM orchestration_runs WHERE run_id = ? AND current_visit_sequence = ?
          AND status = 'failed' AND current_node = ?
          AND last_transition_id = ? AND workflow_instance_id = ?`)
        .bind(retryId,input.failedAttemptId,input.retryNode,transitionId,input.requestedBy,input.now,input.now,
          retryKind,target.name,target.version,target.digest,targetId,source.source_delivery_id,input.runId,source.current_visit_sequence,failure.node,input.failedAttemptId,source.workflow_instance_id),
      this.db.prepare(`UPDATE orchestration_runs SET workflow_instance_id = ?, previous_node = current_node,
        current_node = ?,current_visit_sequence = current_visit_sequence+1,last_transition_id = ?,
        definition_id = ?,definition_version = ?,definition_digest = ?,
        status = 'active',gate_origin_node = NULL,terminal_at = NULL,terminal_cause = NULL,updated_at = ?
        WHERE run_id = ? AND status = 'failed' AND current_node = ?
          AND current_visit_sequence = ? AND last_transition_id = ? AND workflow_instance_id = ?
          AND EXISTS (SELECT 1 FROM publication_stage_retries WHERE retry_id = ?)`)
        .bind(targetId,input.retryNode,transitionId,target.name,target.version,target.digest,input.now,input.runId,failure.node,source.current_visit_sequence,
          input.failedAttemptId,source.workflow_instance_id,retryId),
      this.db.prepare(`UPDATE dispatch_intents SET workflow_instance_id = ?,safe_error_category = NULL,updated_at = ?
        WHERE run_id = ? AND workflow_instance_id = ? AND source_delivery_id = ?
        AND EXISTS (SELECT 1 FROM orchestration_runs WHERE run_id = ? AND last_transition_id = ?)`)
        .bind(targetId,input.now,input.runId,source.workflow_instance_id,source.source_delivery_id,input.runId,transitionId),
      this.db.prepare(`INSERT OR IGNORE INTO workflow_transitions_v2
        (transition_id,run_id,from_node,to_node,from_visit_sequence,to_visit_sequence,
         cause_type,cause_reference,actor_id,actor_type,provider_operation_id,occurred_at)
        SELECT retry.transition_id,retry.run_id,?,retry.retry_node,
          retry.from_visit_sequence,retry.to_visit_sequence,'operator_retry',retry.failed_attempt_id,
          retry.requested_by,'operator',NULL,? FROM publication_stage_retries retry
        JOIN orchestration_runs run ON run.run_id = retry.run_id AND run.last_transition_id = retry.transition_id
        WHERE retry.retry_id = ?`).bind(failure.node,input.now,retryId),
    ]);
    const prepared = await this.find(input.failedAttemptId);
    if (!prepared || (results.some(r => (r.meta.changes ?? 0) !== 1) &&
        prepared.current_visit_sequence !== prepared.to_visit_sequence)) throw new Error("stage_retry_not_eligible");
    return prepared;
  }

  async observe(input: Parameters<AgentStageRetryStore["observe"]>[0]): Promise<AgentStageRetryRecord> {
    if (!input.retryId.startsWith("publication-retry:")) return this.agents.observe(input);
    await this.db.prepare(`UPDATE publication_stage_retries SET state = ?,workflow_status = ?,
      safe_error_category = ?,updated_at = ?,established_at = CASE WHEN ? = 'established' THEN ? ELSE established_at END
      WHERE retry_id = ?`).bind(input.state,input.workflowStatus,input.safeErrorCategory,input.now,
        input.state,input.now,input.retryId).run();
    const record = await this.find(input.retryId.slice("publication-retry:".length));
    if (!record) throw new Error("stage_retry_observation_read_back_failed");
    return record;
  }
}
