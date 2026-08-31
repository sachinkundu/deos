import { operationIdentity } from "./orchestration-identity.ts";
import type { SandboxFactory } from "./sandbox-controller.ts";
import type { LifecycleWriter } from "./lifecycle-telemetry.ts";

interface CleanupCandidate {
  sandbox_id: string;
  run_id: string | null;
  attempt_id: string | null;
  process_id: string | null;
  state: string | null;
  cleanup_state: string | null;
  cleanup_hold_until: string | null;
  cleanup_hold_reason: string | null;
}

interface CleanupWorkItem {
  sandbox_id: string;
  run_id: string | null;
  attempt_id: string | null;
  linear_operation_id: string;
  linear_resource_id: string | null;
  cleanup_state: "pending" | "reported" | "destroyed" | "failed";
}

export interface CleanupAuditStore {
  knownLive(): Promise<CleanupCandidate[]>;
  terminalPendingCleanup(now: string): Promise<CleanupCandidate[]>;
  candidate(sandboxId: string): Promise<CleanupCandidate | null>;
  upsertWorkItem(candidate: CleanupCandidate, operationId: string, now: string): Promise<CleanupWorkItem>;
  markReported(sandboxId: string, linearResourceId: string, now: string): Promise<void>;
  markAttemptCleanup(attemptId: string, state: "destroyed" | "failed", category: string | null, now: string): Promise<void>;
}

export class D1CleanupAuditStore implements CleanupAuditStore {
  private readonly database: D1Database;

  constructor(database: D1Database) {
    this.database = database;
  }

  knownLive(): Promise<CleanupCandidate[]> {
    return this.database.prepare(
      `SELECT sandbox_id, run_id, attempt_id, process_id, state, cleanup_state,
              cleanup_hold_until, cleanup_hold_reason
       FROM agent_attempts
       WHERE state IN ('pending', 'starting', 'running', 'collecting')`,
    ).all<CleanupCandidate>().then((result) => result.results);
  }

  terminalPendingCleanup(now: string): Promise<CleanupCandidate[]> {
    return this.database.prepare(
      `SELECT sandbox_id, run_id, attempt_id, process_id, state, cleanup_state,
              cleanup_hold_until, cleanup_hold_reason
       FROM agent_attempts
       WHERE state IN ('completed', 'blocked', 'failed', 'interrupted', 'absolute_timeout', 'canceled')
         AND cleanup_state <> 'destroyed'
         AND (cleanup_hold_until IS NULL OR cleanup_hold_until <= ?)`,
    ).bind(now).all<CleanupCandidate>().then((result) => result.results);
  }

  candidate(sandboxId: string): Promise<CleanupCandidate | null> {
    return this.database.prepare(
      `SELECT sandbox_id, run_id, attempt_id, process_id, state, cleanup_state,
              cleanup_hold_until, cleanup_hold_reason
       FROM agent_attempts WHERE sandbox_id = ?`,
    ).bind(sandboxId).first<CleanupCandidate>();
  }

  async upsertWorkItem(
    candidate: CleanupCandidate,
    operationId: string,
    now: string,
  ): Promise<CleanupWorkItem> {
    await this.database.prepare(
      `INSERT OR IGNORE INTO cleanup_work_items
       (sandbox_id, run_id, attempt_id, linear_operation_id, cleanup_state, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'pending', ?, ?)`,
    ).bind(
      candidate.sandbox_id,
      candidate.run_id,
      candidate.attempt_id,
      operationId,
      now,
      now,
    ).run();
    const item = await this.database.prepare(
      "SELECT * FROM cleanup_work_items WHERE sandbox_id = ?",
    ).bind(candidate.sandbox_id).first<CleanupWorkItem>();
    if (item === null) throw new Error("cleanup work item is not readable");
    return item;
  }

  async markReported(sandboxId: string, linearResourceId: string, now: string): Promise<void> {
    await this.database.prepare(
      `UPDATE cleanup_work_items
       SET cleanup_state = 'reported', linear_resource_id = ?, last_attempt_at = ?, updated_at = ?
       WHERE sandbox_id = ? AND cleanup_state IN ('pending', 'reported')`,
    ).bind(linearResourceId, now, now, sandboxId).run();
  }

  async markAttemptCleanup(
    attemptId: string,
    state: "destroyed" | "failed",
    category: string | null,
    now: string,
  ): Promise<void> {
    await this.database.prepare(
      `UPDATE agent_attempts
       SET cleanup_state = ?, cleanup_error_category = ?, cleanup_hold_until = NULL,
           cleanup_hold_reason = NULL, updated_at = ?
       WHERE attempt_id = ?`,
    ).bind(state, category, now, attemptId).run();
  }
}

interface CleanupAuditConfig {
  linearApiUrl: string;
  linearAccessToken: string;
  linearTeamId: string;
  auditSecret: string;
}

interface CleanupAuditDependencies {
  fetch: typeof fetch;
  now: () => Date;
  lifecycle?: LifecycleWriter;
}

export class CleanupAuditor {
  private readonly store: CleanupAuditStore;
  private readonly sandboxes: SandboxFactory;
  private readonly config: CleanupAuditConfig;
  private readonly request: typeof fetch;
  private readonly now: () => Date;
  private readonly lifecycle?: LifecycleWriter;

  constructor(
    store: CleanupAuditStore,
    sandboxes: SandboxFactory,
    config: CleanupAuditConfig,
    dependencies: Partial<CleanupAuditDependencies> = {},
  ) {
    this.store = store;
    this.sandboxes = sandboxes;
    this.config = config;
    this.request = dependencies.fetch ?? ((input, init) => fetch(input, init));
    this.now = dependencies.now ?? (() => new Date());
    this.lifecycle = dependencies.lifecycle;
  }

  async scheduled(): Promise<void> {
    const now = this.now().toISOString();
    for (const candidate of await this.store.knownLive()) {
      const sandbox = this.sandboxes.get(candidate.sandbox_id, { keepAlive: true });
      const process = candidate.process_id === null ? null : await sandbox.getProcess(candidate.process_id);
      if (process === null && candidate.state !== "pending") await this.report(candidate);
    }
    for (const candidate of await this.store.terminalPendingCleanup(now)) {
      const sandbox = this.sandboxes.get(candidate.sandbox_id, { keepAlive: false });
      try {
        await sandbox.setKeepAlive(false);
        await sandbox.destroy();
        if (candidate.attempt_id !== null) {
          await this.store.markAttemptCleanup(
            candidate.attempt_id,
            "destroyed",
            null,
            this.now().toISOString(),
          );
        }
      } catch {
        if (candidate.attempt_id !== null) {
          await this.store.markAttemptCleanup(
            candidate.attempt_id,
            "failed",
            "scheduled_destroy_failed",
            this.now().toISOString(),
          );
        }
        await this.report(candidate);
      }
    }
  }

  async handle(request: Request): Promise<Response> {
    if (request.method !== "POST") return Response.json({ error: "method_not_allowed" }, { status: 405 });
    const authorization = request.headers.get("Authorization") ?? "";
    if (authorization !== `Bearer ${this.config.auditSecret}`) {
      return Response.json({ error: "invalid_audit_capability" }, { status: 401 });
    }
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "invalid_json" }, { status: 400 });
    }
    if (
      typeof body !== "object" || body === null || Array.isArray(body) ||
      Object.keys(body).some((key) => !["version", "sandboxIds"].includes(key)) ||
      (body as { version?: unknown }).version !== 1 ||
      !Array.isArray((body as { sandboxIds?: unknown }).sandboxIds)
    ) return Response.json({ error: "invalid_inventory" }, { status: 400 });
    const sandboxIds = (body as { sandboxIds: unknown[] }).sandboxIds;
    if (
      sandboxIds.length > 100 ||
      sandboxIds.some((id) => typeof id !== "string" || !/^sbx-v1-[a-z2-7]{20,80}$/.test(id))
    ) return Response.json({ error: "invalid_inventory" }, { status: 400 });
    let reported = 0;
    for (const sandboxId of new Set(sandboxIds as string[])) {
      const known = await this.store.candidate(sandboxId);
      if (known !== null && ["pending", "starting", "running", "collecting"].includes(known.state ?? "")) {
        continue;
      }
      if (known?.cleanup_hold_until !== null && known?.cleanup_hold_until !== undefined &&
        known.cleanup_hold_until > this.now().toISOString()) continue;
      if (known?.cleanup_state === "destroyed") continue;
      await this.report(known ?? {
        sandbox_id: sandboxId,
        run_id: null,
        attempt_id: null,
        process_id: null,
        state: null,
        cleanup_state: null,
        cleanup_hold_until: null,
        cleanup_hold_reason: null,
      });
      reported += 1;
    }
    return Response.json({ version: 1, reported }, { headers: { "Cache-Control": "no-store" } });
  }

  private async report(candidate: CleanupCandidate): Promise<void> {
    const lineage = candidate.run_id ?? `standalone:${candidate.sandbox_id}`;
    const operationId = operationIdentity(lineage, "cleanup", `report:${candidate.sandbox_id}`, 1);
    const item = await this.store.upsertWorkItem(candidate, operationId, this.now().toISOString());
    if (item.linear_resource_id !== null) return;
    const marker = `<!-- deos-operation:${operationId} -->`;
    const existing = await this.findIssue(marker);
    const issueId = existing ?? await this.createIssue(candidate, marker);
    await this.store.markReported(candidate.sandbox_id, issueId, this.now().toISOString());
    this.lifecycle?.({
      stage: "cleanup.audit",
      outcome: existing === null ? "succeeded" : "reconciled",
      correlationId: candidate.run_id?.split(":run:")[0] ?? lineage,
      runId: lineage,
      sandboxId: candidate.sandbox_id,
      operationId,
    });
  }

  private async findIssue(marker: string): Promise<string | null> {
    const payload = await this.graphql(
      `query DeosCleanupIssues($teamId: ID!) {
         issues(filter: { team: { id: { eq: $teamId } } }, first: 100) {
           nodes { id description }
         }
       }`,
      { teamId: this.config.linearTeamId },
    ) as { data?: { issues?: { nodes?: Array<{ id?: string; description?: string }> } } };
    const match = payload.data?.issues?.nodes?.find((issue) => issue.description?.includes(marker));
    return typeof match?.id === "string" ? match.id : null;
  }

  private async createIssue(candidate: CleanupCandidate, marker: string): Promise<string> {
    const payload = await this.graphql(
      `mutation DeosCreateCleanupIssue($teamId: String!, $title: String!, $description: String!) {
         issueCreate(input: { teamId: $teamId, title: $title, description: $description }) {
           success
           issue { id }
         }
       }`,
      {
        teamId: this.config.linearTeamId,
        title: `DEOS Sandbox cleanup ${candidate.sandbox_id.slice(0, 24)}`,
        description: [
          "A Sandbox resource requires operator reconciliation.",
          `Sandbox: ${candidate.sandbox_id}`,
          `Run: ${candidate.run_id ?? "unassociated"}`,
          marker,
        ].join("\n"),
      },
    ) as { data?: { issueCreate?: { success?: boolean; issue?: { id?: string } } } };
    const id = payload.data?.issueCreate?.issue?.id;
    if (payload.data?.issueCreate?.success !== true || typeof id !== "string") {
      throw new Error("Linear cleanup issue response is invalid");
    }
    return id;
  }

  private async graphql(query: string, variables: Record<string, string>): Promise<unknown> {
    const response = await this.request(this.config.linearApiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.linearAccessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
    });
    if (!response.ok) throw new Error("Linear cleanup request failed");
    const payload = await response.json() as { errors?: unknown[] };
    if (payload.errors?.length) throw new Error("Linear cleanup GraphQL request failed");
    return payload;
  }
}
