export const TELEMETRY_SCHEMA_VERSION = "1" as const;

export const WORKFLOW_STAGES = [
  "ingress.delivery_record",
  "queue.publish",
  "queue.consume",
  "workflow.transition",
  "linear.issue_update",
] as const;

export const WORKFLOW_OUTCOMES = ["started", "succeeded", "failed", "duplicate"] as const;

export const ERROR_TYPES = [
  "correlation_mismatch",
  "d1_operation_failed",
  "queue_publish_failed",
  "linear_transport_failed",
  "linear_http_failed",
  "linear_graphql_failed",
  "unexpected_failure",
] as const;

export type WorkflowStage = (typeof WORKFLOW_STAGES)[number];
export type WorkflowOutcome = (typeof WORKFLOW_OUTCOMES)[number];
export type ErrorType = (typeof ERROR_TYPES)[number];

export interface ObservationInput {
  serviceName: string;
  stage: WorkflowStage;
  outcome: WorkflowOutcome;
  correlationId: string;
  deliveryId: string;
  issueId: string;
  projectId: string;
  runId: string;
  errorType?: ErrorType;
  messageId?: string;
  attemptNumber?: number;
  previousState?: string;
  nextState?: string;
  cause?: string;
}

export type WorkflowObservation = Record<string, string | number>;
export type ObservationWriter = (observation: WorkflowObservation) => void;

export const workflowIdentity = (projectId: string, issueId: string): string => {
  if (!projectId || !issueId) throw new Error("project and issue identifiers are required");
  return `workflow:${projectId}:${issueId}`;
};

export const buildObservation = (
  input: ObservationInput,
  now: () => Date = () => new Date(),
): WorkflowObservation => {
  const required = [
    input.serviceName,
    input.correlationId,
    input.deliveryId,
    input.issueId,
    input.projectId,
    input.runId,
  ];
  if (required.some((value) => value.length === 0)) {
    throw new Error("required observation values must not be empty");
  }
  if (input.outcome === "failed" && input.errorType === undefined) {
    throw new Error("failed observations require an error type");
  }
  if (input.outcome !== "failed" && input.errorType !== undefined) {
    throw new Error("error type is allowed only for failed observations");
  }
  if ((input.messageId === undefined) !== (input.attemptNumber === undefined)) {
    throw new Error("Queue message id and attempt number must be supplied together");
  }
  if (input.attemptNumber !== undefined && input.attemptNumber < 1) {
    throw new Error("Queue attempt number starts at 1");
  }

  return Object.fromEntries(
    Object.entries({
      "event.time": now().toISOString(),
      "event.name": `deos.workflow.${input.stage}`,
      "service.name": input.serviceName,
      "deos.telemetry.schema_version": TELEMETRY_SCHEMA_VERSION,
      "deos.workflow.correlation_id": input.correlationId,
      "deos.workflow.stage": input.stage,
      "deos.workflow.outcome": input.outcome,
      "linear.delivery.id": input.deliveryId,
      "linear.issue.id": input.issueId,
      "linear.project.id": input.projectId,
      "deos.workflow.run_id": input.runId,
      "error.type": input.errorType,
      "messaging.message.id": input.messageId,
      "deos.workflow.attempt.number": input.attemptNumber,
      "deos.workflow.previous_state": input.previousState,
      "deos.workflow.next_state": input.nextState,
      "deos.workflow.cause": input.cause,
    }).filter((entry): entry is [string, string | number] => entry[1] !== undefined),
  );
};

export const writeObservation: ObservationWriter = (observation) => {
  if (observation["deos.workflow.outcome"] === "failed") console.error(observation);
  else console.log(observation);
};
