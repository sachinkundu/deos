import assert from "node:assert/strict";
import test from "node:test";

import { D1OrchestrationStore, type OrchestrationRunRecord } from "../src/orchestration-store.ts";
import type { LoadedWorkflowDefinition } from "../src/workflow-definition.ts";

test("allocateRun binds one value for every D1 placeholder", async () => {
  let inserted: OrchestrationRunRecord | null = null;
  const database = {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          return {
            async first() {
              if (sql.includes("status IN")) return null;
              if (sql.includes("MAX(run_sequence)")) return { next_sequence: 1 };
              if (sql.includes("WHERE run_id = ?")) return inserted;
              throw new Error(`unexpected first query: ${sql}`);
            },
            async run() {
              const placeholders = (sql.match(/\?/g) ?? []).length;
              assert.equal(values.length, placeholders);
              inserted = {
                run_id: String(values[0]),
                correlation_id: String(values[1]),
                run_sequence: Number(values[2]),
                project_id: String(values[3]),
                issue_id: String(values[4]),
                definition_id: String(values[5]),
                definition_version: Number(values[6]),
                definition_digest: String(values[7]),
                workflow_instance_id: String(values[8]),
                previous_node: null,
                current_node: String(values[9]),
                current_visit_sequence: 1,
                last_transition_id: null,
                gate_origin_node: null,
                status: "pending_dispatch",
                accumulated_data_json: "{}",
                created_at: String(values[18]),
                updated_at: String(values[19]),
                terminal_at: null,
              };
              return { meta: { changes: 1 } };
            },
          };
        },
      };
    },
  } as unknown as D1Database;
  const definition = {
    name: "simple",
    version: 2,
    start: "claim_issue",
    digest: "definition-digest",
  } as LoadedWorkflowDefinition;

  const allocation = await new D1OrchestrationStore(database).allocateRun({
    projectId: "project-1",
    issueId: "issue-1",
    definition,
    selection: {
      kind: "linear_label",
      value: "simple-workflow",
      labelName: "simple-workflow",
      reason: "label_match",
      evidenceJson: '{"status":"available"}',
      deliveryId: "delivery-1",
      observedAt: "2026-08-24T10:13:28.382Z",
      providerDigest: "selection-digest",
    },
    now: "2026-08-24T10:13:29.190Z",
  });

  assert.equal(allocation.created, true);
  assert.equal(allocation.run.current_node, "claim_issue");
  assert.equal(allocation.run.definition_version, 2);
});
