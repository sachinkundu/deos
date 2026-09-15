import {
  D1OrchestrationStore,
  type OrchestrationRunRecord,
} from "./orchestration-store.ts";
import { implementationGitHub } from "./implementation-github.ts";
import { ImplementationStore } from "./implementation-store.ts";
import { sha256Hex } from "./implementation-hash.ts";
import {
  ImplementationBrowserAllocator,
  CloudflareBrowserProvider,
} from "./implementation-browser.ts";

/** Cron is a wake-up producer. Only the workflow consumes a saved event and changes its node. */
export async function reconcileImplementations(env: Env) {
  const store = new ImplementationStore(env.DB, env.ARTIFACTS);
  const authority = new D1OrchestrationStore(env.DB);
  const runs = await env.DB.prepare(
    `SELECT r.* FROM orchestration_runs r JOIN implementation_runs i ON i.run_id=r.run_id
    WHERE r.definition_id='implementation' AND r.current_node='implementation_review' AND r.status='awaiting_human'`,
  ).all<OrchestrationRunRecord>();
  for (const run of runs.results) {
    try {
      const work = await store.requireRun(run.run_id),
        base = await implementationGitHub(env, run).ref("main");
      if (base === work.tested_base_sha) continue;
      const deliveryId = `implementation-base:${run.run_id}:${run.current_visit_sequence}:${base}`;
      const now = new Date().toISOString();
      await authority.insertInboxEvent(
        {
          deliveryId,
          runId: run.run_id,
          correlationId: run.correlation_id,
          eventKind: "implementation_base_changed",
          actorId: null,
          actorType: "workflow",
          providerTime: now,
          fromStateId: null,
          fromStateName: null,
          toStateId: null,
          toStateName: "base_changed",
          payloadDigest: await sha256Hex(base!),
        },
        now,
      );
      const event = await authority.findInboxEvent(deliveryId);
      if (event?.state === "pending") {
        const instance = await env.ORCHESTRATION_WORKFLOW.get(
          run.workflow_instance_id,
        );
        await instance.sendEvent({
          type: "linear-event",
          payload: { deliveryId },
        });
        await authority.markInboxState(deliveryId, "pending", "sent", now);
      }
    } catch (error) {
      await store.error(run.run_id, null, "base_drift_reconciliation", error);
    }
  }
  const quarantined = await env.DB.prepare(
    "SELECT * FROM implementation_resources WHERE kind='browser' AND (status='quarantined' OR (status='allocating' AND create_window IS NOT NULL))",
  ).all<import("./implementation-store.ts").ImplementationResource>();
  const browsers = new ImplementationBrowserAllocator(
    store,
    new CloudflareBrowserProvider(env.IMPLEMENTATION_BROWSER),
  );
  for (const resource of quarantined.results) {
    try {
      await browsers.reconcile(resource);
    } catch (error) {
      await store.error(
        resource.run_id,
        resource.attempt_id,
        "browser_reconciliation",
        error,
      );
    }
  }
  await browsers.reconcileCompletedAttempts();
}
