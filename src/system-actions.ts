import type { OrchestrationRunRecord } from "./orchestration-store.ts";
import type { ValidatedSystemOutcome } from "./workflow-evaluator.ts";

export interface SystemActionStore {
  prerequisites(runId: string): Promise<{
    completeManifests: number;
    incompleteOperations: number;
    deploymentReceipts: number;
  }>;
}

export class D1SystemActionStore implements SystemActionStore {
  private readonly database: D1Database;

  constructor(database: D1Database) {
    this.database = database;
  }

  async prerequisites(runId: string): Promise<{
    completeManifests: number;
    incompleteOperations: number;
    deploymentReceipts: number;
  }> {
    const row = await this.database.prepare(
      `SELECT
         (SELECT COUNT(*) FROM artifact_manifests WHERE run_id = ? AND state = 'complete') AS completeManifests,
         (SELECT COUNT(*) FROM provider_operations
          WHERE run_id = ? AND state IN ('pending', 'failed', 'manual_reconciliation_required')) AS incompleteOperations,
         (SELECT COUNT(*) FROM provider_operations
          WHERE run_id = ? AND capability = 'cloudflare.deploy'
            AND state IN ('succeeded', 'reconciled')) AS deploymentReceipts`,
    ).bind(runId, runId, runId).first<{
      completeManifests: number;
      incompleteOperations: number;
      deploymentReceipts: number;
    }>();
    return row ?? { completeManifests: 0, incompleteOperations: 1, deploymentReceipts: 0 };
  }
}

export class SystemActionController {
  private readonly store: SystemActionStore;

  constructor(store: SystemActionStore) {
    this.store = store;
  }

  async execute(
    run: OrchestrationRunRecord,
    _nodeId: string,
    action: string,
  ): Promise<ValidatedSystemOutcome> {
    const prerequisites = await this.store.prerequisites(run.run_id);
    const deploymentReady = action !== "release.deploy" || prerequisites.deploymentReceipts > 0;
    const completed =
      prerequisites.completeManifests > 0 &&
      prerequisites.incompleteOperations === 0 &&
      deploymentReady;
    return {
      kind: "system_action",
      outcome: completed ? "completed" : "failed",
      providerReceiptsComplete: completed,
    };
  }
}
