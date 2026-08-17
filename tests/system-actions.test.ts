import assert from "node:assert/strict";
import test from "node:test";

import type { OrchestrationRunRecord } from "../src/orchestration-store.ts";
import { SystemActionController, type SystemActionStore } from "../src/system-actions.ts";

const run = { run_id: "run-1" } as OrchestrationRunRecord;

class Store implements SystemActionStore {
  incompleteOperations = 0;
  actionReceipts = 0;
  observedAction: string | null = null;

  prerequisites(_runId: string, action: string) {
    this.observedAction = action;
    return Promise.resolve({
      incompleteOperations: this.incompleteOperations,
      actionReceipts: this.actionReceipts,
    });
  }
}

test("system action does not advance from unrelated manifests or provider operations", async () => {
  const store = new Store();
  const controller = new SystemActionController(store);
  const outcome = await controller.execute(run, "openspec_proposal", "openspec.create_proposal_and_requirements");

  assert.equal(store.observedAction, "openspec.create_proposal_and_requirements");
  assert.deepEqual(outcome, {
    kind: "system_action",
    outcome: "failed",
    providerReceiptsComplete: false,
  });
});

test("system action advances only with an exact durable action receipt", async () => {
  const store = new Store();
  store.actionReceipts = 1;
  const controller = new SystemActionController(store);
  const outcome = await controller.execute(run, "openspec_verify", "openspec.verify");

  assert.deepEqual(outcome, {
    kind: "system_action",
    outcome: "completed",
    providerReceiptsComplete: true,
  });
});

test("an incomplete provider operation prevents system action completion", async () => {
  const store = new Store();
  store.actionReceipts = 1;
  store.incompleteOperations = 1;
  const controller = new SystemActionController(store);
  const outcome = await controller.execute(run, "deploy", "release.deploy");

  assert.equal(outcome.outcome, "failed");
  assert.equal(outcome.providerReceiptsComplete, false);
});
