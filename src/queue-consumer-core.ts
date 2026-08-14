import { decideWorkflowAction, type WorkflowState } from "./workflow.ts";
import {
  buildObservation,
  type ErrorType,
  type ObservationInput,
  type ObservationWriter,
  workflowIdentity,
  writeObservation,
} from "./telemetry.ts";

export interface QueueBody {
  event_id: string;
  source_delivery_id: string;
  issue_id: string;
  project_id: string;
  transition: string;
  actor_id?: string | null;
  occurred_at: string;
  correlation_id: string;
}

export interface QueueConsumerEnv extends Env {
  LINEAR_API_KEY: string;
}

interface WorkflowRow {
  run_id: string;
  current_state: WorkflowState;
  correlation_id: string;
}

type QueueMessageView = Pick<Message<QueueBody>, "id" | "attempts" | "body">;

interface ConsumerDependencies {
  fetch: typeof fetch;
  observe: ObservationWriter;
}

const SERVICE_NAME = "deos-queue-consumer-ts";

export class CategorizedWorkflowError extends Error {
  readonly category: ErrorType;

  constructor(category: ErrorType) {
    super(category);
    this.name = "CategorizedWorkflowError";
    this.category = category;
  }
}

const errorCategory = (error: unknown): ErrorType =>
  error instanceof CategorizedWorkflowError ? error.category : "unexpected_failure";

const asD1Operation = async <T>(operation: () => Promise<T>): Promise<T> => {
  try {
    return await operation();
  } catch {
    throw new CategorizedWorkflowError("d1_operation_failed");
  }
};

const observationBase = (
  event: QueueBody,
  message: QueueMessageView,
): Omit<ObservationInput, "stage" | "outcome"> => {
  const runId = workflowIdentity(event.project_id, event.issue_id);
  return {
    serviceName: SERVICE_NAME,
    correlationId: runId,
    deliveryId: event.source_delivery_id,
    issueId: event.issue_id,
    projectId: event.project_id,
    runId,
    messageId: message.id,
    attemptNumber: message.attempts,
  };
};

const emit = (
  observe: ObservationWriter,
  base: Omit<ObservationInput, "stage" | "outcome">,
  input: Pick<ObservationInput, "stage" | "outcome"> & Partial<ObservationInput>,
): void => observe(buildObservation({ ...base, ...input }));

const moveIssueToHumanApproval = async (
  event: QueueBody,
  env: QueueConsumerEnv,
  request: typeof fetch,
): Promise<void> => {
  let response: Response;
  try {
    response = await request(env.LINEAR_API_URL ?? "https://api.linear.app/graphql", {
      method: "POST",
      headers: {
        Authorization: env.LINEAR_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query:
          "mutation UpdateIssue($id: String!, $stateId: String!) { issueUpdate(id: $id, input: { stateId: $stateId }) { success } }",
        variables: { id: event.issue_id, stateId: env.LINEAR_HUMAN_APPROVAL_STATE_ID },
      }),
    });
  } catch {
    throw new CategorizedWorkflowError("linear_transport_failed");
  }
  if (!response.ok) throw new CategorizedWorkflowError("linear_http_failed");

  let payload: { data?: { issueUpdate?: { success?: boolean } }; errors?: unknown[] };
  try {
    payload = (await response.json()) as typeof payload;
  } catch {
    throw new CategorizedWorkflowError("linear_graphql_failed");
  }
  if (payload.errors?.length || !payload.data?.issueUpdate?.success) {
    throw new CategorizedWorkflowError("linear_graphql_failed");
  }
};

const recordTransition = async (
  event: QueueBody,
  env: QueueConsumerEnv,
  observe: ObservationWriter,
  base: Omit<ObservationInput, "stage" | "outcome">,
  runId: string,
  transition: [WorkflowState, WorkflowState, string],
  updateRun: boolean,
): Promise<void> => {
  const [previousState, nextState, cause] = transition;
  const transitionFields = { previousState, nextState, cause };
  emit(observe, base, { stage: "workflow.transition", outcome: "started", ...transitionFields });
  try {
    await asD1Operation(() =>
      env.DB.prepare(
        "INSERT OR IGNORE INTO workflow_transitions (run_id, previous_state, next_state, cause, actor_id, occurred_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
        .bind(runId, previousState, nextState, cause, event.actor_id ?? null, new Date(event.occurred_at).toISOString())
        .run(),
    );
    if (updateRun) {
      await asD1Operation(() =>
        env.DB.prepare("UPDATE workflow_runs SET current_state = ?, updated_at = ? WHERE run_id = ?")
          .bind(nextState, new Date(event.occurred_at).toISOString(), runId)
          .run(),
      );
    }
  } catch (error) {
    emit(observe, base, {
      stage: "workflow.transition",
      outcome: "failed",
      errorType: errorCategory(error),
      ...transitionFields,
    });
    throw error;
  }
  emit(observe, base, { stage: "workflow.transition", outcome: "succeeded", ...transitionFields });
};

const recordWorkflow = async (
  event: QueueBody,
  env: QueueConsumerEnv,
  observe: ObservationWriter,
  base: Omit<ObservationInput, "stage" | "outcome">,
): Promise<"started" | "approved" | "rejected" | "ignored"> => {
  const existing = await asD1Operation(() =>
    env.DB.prepare(
      "SELECT run_id, current_state, correlation_id FROM workflow_runs WHERE project_id = ? AND issue_id = ?",
    )
      .bind(event.project_id, event.issue_id)
      .first<WorkflowRow>(),
  );
  const runId = workflowIdentity(event.project_id, event.issue_id);
  if (existing !== null && (existing.run_id !== runId || existing.correlation_id !== runId)) {
    throw new CategorizedWorkflowError("correlation_mismatch");
  }
  const occurredAt = new Date(event.occurred_at).toISOString();
  const action = decideWorkflowAction(event, existing?.current_state ?? null);
  if (action.kind === "ignore") return "ignored";

  if (action.kind === "start") {
    await asD1Operation(() =>
      env.DB.prepare(
        "INSERT OR IGNORE INTO workflow_runs (run_id, project_id, issue_id, current_state, correlation_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
        .bind(runId, event.project_id, event.issue_id, "awaiting_human_approval", runId, occurredAt, occurredAt)
        .run(),
    );
  }

  const transitions = action.kind === "start" ? action.transitions : [action.transition];
  for (const transition of transitions) {
    await recordTransition(event, env, observe, base, runId, transition, action.kind !== "start");
  }
  if (action.kind === "start") return "started";
  return action.kind === "approve" ? "approved" : "rejected";
};

export const processQueueMessage = async (
  message: QueueMessageView,
  env: QueueConsumerEnv,
  dependencies: Partial<ConsumerDependencies> = {},
): Promise<void> => {
  const observe = dependencies.observe ?? writeObservation;
  const request = dependencies.fetch ?? fetch;
  const event = message.body;
  const base = observationBase(event, message);
  emit(observe, base, { stage: "queue.consume", outcome: "started" });
  try {
    if (event.correlation_id !== base.correlationId) {
      throw new CategorizedWorkflowError("correlation_mismatch");
    }
    const action = await recordWorkflow(event, env, observe, base);
    if (action === "started") {
      emit(observe, base, { stage: "linear.issue_update", outcome: "started" });
      try {
        await moveIssueToHumanApproval(event, env, request);
      } catch (error) {
        emit(observe, base, {
          stage: "linear.issue_update",
          outcome: "failed",
          errorType: errorCategory(error),
        });
        throw error;
      }
      emit(observe, base, { stage: "linear.issue_update", outcome: "succeeded" });
    }
  } catch (error) {
    emit(observe, base, {
      stage: "queue.consume",
      outcome: "failed",
      errorType: errorCategory(error),
    });
    throw error;
  }
  emit(observe, base, { stage: "queue.consume", outcome: "succeeded" });
};

export const processQueueBatch = async (
  batch: MessageBatch<QueueBody>,
  env: QueueConsumerEnv,
): Promise<void> => {
  await asD1Operation(() =>
    env.DB.prepare(
      "INSERT INTO queue_consumptions (consumption_id, batch_size, received_at) VALUES (?, ?, ?)",
    )
      .bind(crypto.randomUUID(), batch.messages.length, new Date().toISOString())
      .run(),
  );
  for (const message of batch.messages) await processQueueMessage(message, env);
};
