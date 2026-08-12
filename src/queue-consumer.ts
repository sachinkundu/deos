interface QueueBody {
  event_id: string;
  source_delivery_id: string;
  issue_id: string;
  project_id: string;
  transition: string;
  actor_id?: string | null;
  occurred_at: string;
}

interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<unknown>;
}

interface D1Database {
  prepare(query: string): D1Statement;
}

interface Env {
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

const runIdFor = (event: QueueBody): string =>
  `workflow:${event.project_id}:${event.issue_id}`;

const moveIssueToHumanApproval = async (event: QueueBody, env: Env): Promise<void> => {
  const response = await fetch(env.LINEAR_API_URL ?? "https://api.linear.app/graphql", {
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
    throw new Error(`Linear issue update failed: ${payload.errors?.[0]?.message ?? "unknown error"}`);
  }
};

const recordWorkflow = async (event: QueueBody, env: Env): Promise<void> => {
  const existing = await env.DB.prepare(
    "SELECT run_id FROM workflow_runs WHERE project_id = ? AND issue_id = ?",
  )
    .bind(event.project_id, event.issue_id)
    .first<{ run_id: string }>();
  const runId = existing?.run_id ?? runIdFor(event);
  const occurredAt = new Date(event.occurred_at).toISOString();

  await env.DB.prepare(
    "INSERT OR IGNORE INTO workflow_runs (run_id, project_id, issue_id, current_state, correlation_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(runId, event.project_id, event.issue_id, "awaiting_human_approval", event.event_id, occurredAt, occurredAt)
    .run();

  for (const [previousState, nextState, cause] of [
    ["received", "queued", "queue-consumed"],
    ["queued", "requirements_in_progress", "workflow-started"],
    ["requirements_in_progress", "awaiting_human_approval", "approval-required"],
  ]) {
    await env.DB.prepare(
      "INSERT OR IGNORE INTO workflow_transitions (run_id, previous_state, next_state, cause, actor_id, occurred_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
      .bind(runId, previousState, nextState, cause, event.actor_id ?? null, occurredAt)
      .run();
  }
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
      await recordWorkflow(event, env);
      await moveIssueToHumanApproval(event, env);
    }
  },
};
