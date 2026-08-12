export interface QueueBody {
  event_id: string;
  source_delivery_id: string;
  issue_id: string;
  project_id: string;
  transition: string;
  actor_id?: string | null;
  occurred_at: string;
}

export interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<unknown>;
}

export interface D1Database {
  prepare(query: string): D1Statement;
}

export interface Env {
  DB: D1Database;
  LINEAR_API_KEY: string;
  LINEAR_HUMAN_APPROVAL_STATE_ID: string;
  LINEAR_API_URL?: string;
}

interface QueueMessage<T> {
  body: T;
}

interface QueueBatch<T> {
  messages: QueueMessage<T>[];
}

import { emitTelemetryEvent, type TelemetryEmitter } from "./telemetry.ts";
import { decideWorkflowAction, type WorkflowState } from "./workflow.ts";

const SERVICE_NAME = "deos-queue-consumer-ts";

const runIdFor = (event: QueueBody): string =>
  `workflow:${event.project_id}:${event.issue_id}`;

export const moveIssueToHumanApproval = async (
  event: QueueBody,
  env: Env,
  emit: TelemetryEmitter = emitTelemetryEvent,
  fetchImpl: typeof fetch = fetch,
): Promise<void> => {
  const correlationId = event.source_delivery_id;
  const apiUrl = env.LINEAR_API_URL ?? "https://api.linear.app/graphql";
  emit("deos.linear.issue_update.started", {
    serviceName: SERVICE_NAME,
    correlationId,
    attributes: {
      "deos.issue.id": event.issue_id,
      "server.address": new URL(apiUrl).hostname,
    },
  });
  try {
    const response = await fetchImpl(apiUrl, {
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
    if (!response.ok) {
      throw new Error(`Linear issue update failed with HTTP ${response.status}`);
    }
    const payload = (await response.json()) as {
      data?: { issueUpdate?: { success?: boolean } };
      errors?: Array<{ message?: string }>;
    };
    if (payload.errors?.length || !payload.data?.issueUpdate?.success) {
      throw new Error(
        `Linear issue update failed: ${payload.errors?.[0]?.message ?? "unknown error"}`,
      );
    }
    emit("deos.linear.issue_update.succeeded", {
      serviceName: SERVICE_NAME,
      correlationId,
      attributes: {
        "deos.issue.id": event.issue_id,
        "http.response.status_code": response.status,
      },
    });
  } catch (error) {
    emit("deos.linear.issue_update.failed", {
      serviceName: SERVICE_NAME,
      correlationId,
      severityNumber: 17,
      severityText: "ERROR",
      attributes: {
        "deos.issue.id": event.issue_id,
        "exception.type": error instanceof Error ? error.name : "UnknownError",
        "exception.message": error instanceof Error ? error.message : String(error),
      },
    });
    throw error;
  }
};

export const recordWorkflow = async (
  event: QueueBody,
  env: Env,
  emit: TelemetryEmitter = emitTelemetryEvent,
): Promise<"started" | "approved" | "rejected" | "ignored"> => {
  const correlationId = event.source_delivery_id;
  const existing = await env.DB.prepare(
    "SELECT run_id, current_state FROM workflow_runs WHERE project_id = ? AND issue_id = ?",
  )
    .bind(event.project_id, event.issue_id)
    .first<{ run_id: string; current_state: WorkflowState }>();
  const runId = existing?.run_id ?? runIdFor(event);
  const occurredAt = new Date(event.occurred_at).toISOString();
  const action = decideWorkflowAction(event, existing?.current_state ?? null);
  if (action.kind === "ignore") {
    emit("deos.workflow.action.ignored", {
      serviceName: SERVICE_NAME,
      correlationId,
      attributes: { "deos.workflow.run.id": runId },
    });
    return "ignored";
  }

  await env.DB.prepare(
    "INSERT OR IGNORE INTO workflow_runs (run_id, project_id, issue_id, current_state, correlation_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(runId, event.project_id, event.issue_id, "awaiting_human_approval", correlationId, occurredAt, occurredAt)
    .run();

  emit(existing ? "deos.workflow.run.reused" : "deos.workflow.run.created", {
    serviceName: SERVICE_NAME,
    correlationId,
    attributes: {
      "deos.workflow.run.id": runId,
      "deos.issue.id": event.issue_id,
      "deos.project.id": event.project_id,
    },
  });

  const transitions = action.kind === "start" ? action.transitions : [action.transition];
  for (const [previousState, nextState, cause] of transitions) {
    await env.DB.prepare(
      "INSERT OR IGNORE INTO workflow_transitions (run_id, previous_state, next_state, cause, actor_id, occurred_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
      .bind(runId, previousState, nextState, cause, event.actor_id ?? null, occurredAt)
      .run();
    emit("deos.workflow.transition", {
      serviceName: SERVICE_NAME,
      correlationId,
      timestamp: new Date(occurredAt),
      attributes: {
        "deos.workflow.run.id": runId,
        "deos.workflow.state.previous": previousState,
        "deos.workflow.state.next": nextState,
        "deos.workflow.transition.cause": cause,
      },
    });
  }
  if (action.kind !== "start") {
    await env.DB.prepare("UPDATE workflow_runs SET current_state = ?, updated_at = ? WHERE run_id = ?")
      .bind(action.transition[1], occurredAt, runId)
      .run();
  }
  if (action.kind === "start") return "started";
  return action.kind === "approve" ? "approved" : "rejected";
};

export default {
  async queue(batch: QueueBatch<QueueBody>, env: Env): Promise<void> {
    await env.DB.prepare(
      "INSERT INTO queue_consumptions (consumption_id, batch_size, received_at) VALUES (?, ?, ?)",
    )
      .bind(crypto.randomUUID(), batch.messages.length, new Date().toISOString())
      .run();

    for (const message of batch.messages) {
      const event = message.body;
      emitTelemetryEvent("deos.queue.consumed", {
        serviceName: SERVICE_NAME,
        correlationId: event.source_delivery_id,
        attributes: {
          "deos.delivery.id": event.source_delivery_id,
          "deos.issue.id": event.issue_id,
          "deos.project.id": event.project_id,
        },
      });
      const action = await recordWorkflow(event, env);
      if (action === "started") await moveIssueToHumanApproval(event, env);
    }
  },
};
