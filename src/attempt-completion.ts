import type { QueueConsumerEnv } from "./queue-consumer-core.ts";

export interface AttemptCompletionHint {
  kind: "attempt-completed" | "attempt-progress";
  attemptId: string;
}

/** A wake-up only: the controller still owns process and artifact verification. */
export class AttemptCompletionNotifier {
  private readonly database: D1Database;
  private readonly workflows: QueueConsumerEnv["ORCHESTRATION_WORKFLOW"];
  constructor(
    database: D1Database,
    workflows: QueueConsumerEnv["ORCHESTRATION_WORKFLOW"],
  ) { this.database = database; this.workflows = workflows; }

  async notify(runId: string, attemptId: string, kind: AttemptCompletionHint["kind"] = "attempt-completed"): Promise<boolean> {
    const target = await this.database.prepare(
      `SELECT r.workflow_instance_id AS workflowInstanceId
       FROM agent_attempts a JOIN orchestration_runs r ON r.run_id = a.run_id
       WHERE a.attempt_id = ? AND a.run_id = ?
         AND a.state IN ('starting', 'running') AND a.cleanup_state = 'pending'
         AND r.status = 'active' AND r.current_node = a.node_id
         AND r.current_visit_sequence = a.visit_sequence
         AND a.attempt_id = (
           SELECT latest.attempt_id FROM agent_attempts latest
           WHERE latest.run_id = a.run_id AND latest.node_id = a.node_id
           ORDER BY latest.created_at DESC, latest.attempt_id DESC LIMIT 1
         )`,
    ).bind(attemptId, runId).first<{ workflowInstanceId: string }>();
    if (target === null) return false;
    const instance = await this.workflows.get(target.workflowInstanceId);
    await instance.sendEvent({
      type: "linear-event",
      payload: { kind, attemptId } satisfies AttemptCompletionHint,
    });
    console.log(JSON.stringify({ event: kind === "attempt-progress" ? "sandbox.progress_notified" : "sandbox.completion_notified", run_id: runId,
      attempt_id: attemptId, workflow_instance_id: target.workflowInstanceId }));
    return true;
  }
}
