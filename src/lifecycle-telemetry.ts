export const LIFECYCLE_STAGES = [
  "dispatch.intent",
  "workflow.instance",
  "workflow.step",
  "sandbox.attempt",
  "sandbox.cleanup",
  "codex.outcome",
  "artifact.manifest",
  "provider.operation",
  "linear.repair",
  "cleanup.audit",
] as const;

export const LIFECYCLE_OUTCOMES = [
  "started",
  "running",
  "waiting",
  "succeeded",
  "failed",
  "blocked",
  "denied",
  "duplicate",
  "reconciled",
] as const;

export interface LifecycleObservation {
  stage: (typeof LIFECYCLE_STAGES)[number];
  outcome: (typeof LIFECYCLE_OUTCOMES)[number];
  correlationId: string;
  runId: string;
  safeErrorCategory?: string;
  deliveryId?: string;
  workflowInstanceId?: string;
  attemptId?: string;
  sandboxId?: string;
  manifestId?: string;
  operationId?: string;
  nodeId?: string;
  visitId?: string;
  traversalId?: string;
}

export type LifecycleWriter = (input: LifecycleObservation) => void;

export const writeLifecycleObservation: LifecycleWriter = (input) => {
  if (!input.correlationId || !input.runId) throw new Error("lifecycle lineage is required");
  if (input.outcome === "failed" && !input.safeErrorCategory) {
    throw new Error("failed lifecycle observations require a safe category");
  }
  const observation = Object.fromEntries(Object.entries({
    "event.time": new Date().toISOString(),
    "event.name": `deos.orchestration.${input.stage}`,
    "service.name": "deos-queue-consumer-ts",
    "deos.telemetry.schema_version": "2",
    "deos.workflow.stage": input.stage,
    "deos.workflow.outcome": input.outcome,
    "deos.workflow.correlation_id": input.correlationId,
    "deos.workflow.run_id": input.runId,
    "linear.delivery.id": input.deliveryId,
    "cloudflare.workflow.instance_id": input.workflowInstanceId,
    "deos.agent.attempt_id": input.attemptId,
    "cloudflare.sandbox.id": input.sandboxId,
    "deos.artifact.manifest_id": input.manifestId,
    "deos.provider.operation_id": input.operationId,
    "deos.workflow.node_id": input.nodeId,
    "deos.workflow.visit_id": input.visitId,
    "deos.workflow.traversal_id": input.traversalId,
    "error.type": input.safeErrorCategory,
  }).filter(([, value]) => value !== undefined));
  if (input.outcome === "failed") console.error(observation);
  else console.log(observation);
};
