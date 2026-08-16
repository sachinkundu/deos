import type { OrchestrationRunRecord } from "./orchestration-store.ts";
import type { ValidatedSystemOutcome } from "./workflow-evaluator.ts";

export interface SystemActionStore {
  prerequisites(runId: string, action: string): Promise<{
    incompleteOperations: number;
    actionReceipts: number;
  }>;
}

export class D1SystemActionStore implements SystemActionStore {
  private readonly database: D1Database;

  constructor(database: D1Database) {
    this.database = database;
  }

  async prerequisites(runId: string, action: string): Promise<{
    incompleteOperations: number;
    actionReceipts: number;
  }> {
    const row = await this.database.prepare(
      `SELECT
         (SELECT COUNT(*) FROM provider_operations
          WHERE run_id = ? AND state IN ('pending', 'failed', 'manual_reconciliation_required')) AS incompleteOperations,
         (SELECT COUNT(*) FROM provider_operations
          WHERE run_id = ? AND capability = 'system_action' AND action = ?
            AND state IN ('succeeded', 'reconciled')) AS actionReceipts`,
    ).bind(runId, runId, action).first<{
      incompleteOperations: number;
      actionReceipts: number;
    }>();
    return row ?? { incompleteOperations: 1, actionReceipts: 0 };
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
    const prerequisites = await this.store.prerequisites(run.run_id, action);
    const completed = prerequisites.incompleteOperations === 0 && prerequisites.actionReceipts > 0;
    return {
      kind: "system_action",
      outcome: completed ? "completed" : "failed",
      providerReceiptsComplete: completed,
    };
  }
}
