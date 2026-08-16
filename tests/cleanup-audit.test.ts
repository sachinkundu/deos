import assert from "node:assert/strict";
import test from "node:test";

import {
  CleanupAuditor,
  type CleanupAuditStore,
} from "../src/cleanup-audit.ts";
import type { SandboxFactory, SandboxView } from "../src/sandbox-controller.ts";

const SANDBOX_ID = `sbx-v1-${"a".repeat(30)}`;
const NOW = new Date("2026-08-16T12:00:00.000Z");

class Store implements CleanupAuditStore {
  readonly candidates = new Map<string, any>();
  readonly work = new Map<string, any>();
  terminal: any[] = [];
  live: any[] = [];

  knownLive() { return Promise.resolve(this.live); }
  terminalPendingCleanup() { return Promise.resolve(this.terminal); }
  candidate(id: string) { return Promise.resolve(this.candidates.get(id) ?? null); }
  async upsertWorkItem(candidate: any, operationId: string, now: string) {
    const existing = this.work.get(candidate.sandbox_id);
    if (existing !== undefined) return existing;
    const item = {
      sandbox_id: candidate.sandbox_id,
      run_id: candidate.run_id,
      attempt_id: candidate.attempt_id,
      linear_operation_id: operationId,
      linear_resource_id: null,
      cleanup_state: "pending" as const,
      updated_at: now,
    };
    this.work.set(candidate.sandbox_id, item);
    return item;
  }
  async markReported(id: string, resource: string) {
    const item = this.work.get(id);
    item.linear_resource_id = resource;
    item.cleanup_state = "reported";
  }
  async markAttemptCleanup(attemptId: string, state: "destroyed" | "failed") {
    const candidate = [...this.candidates.values()].find((value) => value.attempt_id === attemptId);
    if (candidate !== undefined) candidate.cleanup_state = state;
  }
}

class Sandbox {
  destroyed = false;
  getProcess() { return Promise.resolve(null); }
  setKeepAlive() { return Promise.resolve(); }
  destroy() { this.destroyed = true; return Promise.resolve(); }
}

class Factory implements SandboxFactory {
  readonly sandbox = new Sandbox();
  get() { return this.sandbox as unknown as SandboxView; }
}

const setup = () => {
  const store = new Store();
  const factory = new Factory();
  const issues: Array<{ id: string; description: string }> = [];
  let creates = 0;
  const auditor = new CleanupAuditor(
    store,
    factory,
    {
      linearApiUrl: "https://api.linear.test/graphql",
      linearAccessToken: "linear-token",
      linearTeamId: "team-1",
      auditSecret: "audit-secret",
    },
    {
      now: () => NOW,
      fetch: async (_input, init) => {
        const body = JSON.parse(String(init?.body)) as {
          query: string;
          variables: { description?: string };
        };
        assert.equal(body.query.includes("issueUpdate"), false);
        if (body.query.includes("query DeosCleanupIssues")) {
          return Response.json({ data: { issues: { nodes: issues } } });
        }
        creates += 1;
        const issue = { id: `cleanup-issue-${creates}`, description: body.variables.description ?? "" };
        issues.push(issue);
        return Response.json({ data: { issueCreate: { success: true, issue: { id: issue.id } } } });
      },
    },
  );
  return { store, factory, auditor, creates: () => creates };
};

const inventoryRequest = (secret = "audit-secret") => new Request("https://worker.test/cleanup-audit", {
  method: "POST",
  headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
  body: JSON.stringify({ version: 1, sandboxIds: [SANDBOX_ID] }),
});

test("provider inventory endpoint is authenticated and reports standalone orphans once", async () => {
  const { auditor, store, creates } = setup();
  assert.equal((await auditor.handle(inventoryRequest("wrong"))).status, 401);
  const first = await auditor.handle(inventoryRequest());
  const second = await auditor.handle(inventoryRequest());
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(creates(), 1);
  assert.equal(store.work.get(SANDBOX_ID).linear_resource_id, "cleanup-issue-1");
  assert.equal(store.work.get(SANDBOX_ID).run_id, null);
});

test("known destroyed Sandbox is excluded from external orphan reporting", async () => {
  const { auditor, store, creates } = setup();
  store.candidates.set(SANDBOX_ID, {
    sandbox_id: SANDBOX_ID,
    run_id: "run-1",
    attempt_id: "attempt-1",
    process_id: null,
    state: "completed",
    cleanup_state: "destroyed",
  });
  const response = await auditor.handle(inventoryRequest());
  assert.equal(response.status, 200);
  assert.equal((await response.json() as { reported: number }).reported, 0);
  assert.equal(creates(), 0);
});

test("known live Sandbox is excluded from external orphan reporting", async () => {
  const { auditor, store, creates } = setup();
  store.candidates.set(SANDBOX_ID, {
    sandbox_id: SANDBOX_ID,
    run_id: "run-1",
    attempt_id: "attempt-1",
    process_id: "process-1",
    state: "running",
    cleanup_state: "pending",
  });
  const response = await auditor.handle(inventoryRequest());
  assert.equal(response.status, 200);
  assert.equal((await response.json() as { reported: number }).reported, 0);
  assert.equal(creates(), 0);
});

test("scheduled reconciliation destroys D1-known terminal Sandboxes", async () => {
  const { auditor, store, factory } = setup();
  const candidate = {
    sandbox_id: SANDBOX_ID,
    run_id: "run-1",
    attempt_id: "attempt-1",
    process_id: "process-1",
    state: "failed",
    cleanup_state: "pending",
  };
  store.candidates.set(SANDBOX_ID, candidate);
  store.terminal = [candidate];
  await auditor.scheduled();
  assert.equal(factory.sandbox.destroyed, true);
  assert.equal(candidate.cleanup_state, "destroyed");
});
