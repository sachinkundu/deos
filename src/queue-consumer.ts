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
  run(): Promise<unknown>;
}

interface D1Database {
  prepare(query: string): D1Statement;
}

interface Env {
  DB: D1Database;
}

interface QueueMessage<T> {
  body: T;
}

interface QueueBatch<T> {
  messages: QueueMessage<T>[];
}

const runIdFor = (event: QueueBody): string =>
  // The event id is stable across retries and consumer runtimes.
  event.event_id;

export default {
  async queue(batch: QueueBatch<QueueBody>, env: Env): Promise<void> {
    await env.DB.prepare(
      "INSERT INTO queue_consumptions (consumption_id, batch_size, received_at) VALUES (?, ?, ?)",
    )
      .bind(crypto.randomUUID(), batch.messages.length, new Date().toISOString())
      .run();

    for (const message of batch.messages) {
      const event = message.body;
      const runId = runIdFor(event);
      const occurredAt = new Date(event.occurred_at).toISOString();

      await env.DB.prepare(
        "INSERT OR IGNORE INTO workflow_runs (run_id, project_id, issue_id, current_state, correlation_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
        .bind(
          runId,
          event.project_id,
          event.issue_id,
          "awaiting_human_approval",
          event.event_id,
          occurredAt,
          occurredAt,
        )
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
    }
  },
};
