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
              if (sql.includes("project_workflow_policies WHERE project_id")) return {
                project_id: "project-1",
                linear_project_name: "Sample",
                definition_id: "simple",
                definition_version: 2,
                definition_digest: "definition-digest",
                trial_repository: "owner/sample",
                github_installation_id: "154095438",
                start_state_name: "Todo",
                human_gate_state_id: "human-review",
                dispatch_enabled: 1,
                repository_revision: 1,
                repository_updated_by: "deployment",
                repository_updated_at: "2026-08-24T10:13:29.190Z",
                workflow_revision: 1,
                independent_review_provider: "openrouter",
                independent_review_model: null,
                independent_review_revision: 1,
                route_revision: 1,
                route_digest: "a".repeat(64),
              };
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
                project_id: "project-1",
                issue_id: String(values[3]),
                definition_id: String(values[4]),
                definition_version: Number(values[5]),
                definition_digest: String(values[6]),
                workflow_instance_id: String(values[7]),
                previous_node: null,
                current_node: String(values[8]),
                current_visit_sequence: 1,
                last_transition_id: null,
                gate_origin_node: null,
                status: "pending_dispatch",
                accumulated_data_json: "{}",
                created_at: String(values[23]),
                updated_at: String(values[24]),
                terminal_at: null,
                route_project_name: "Sample",
                route_repository: "owner/sample",
                route_github_installation_id: "154095438",
                route_revision: 1,
                route_digest: "a".repeat(64),
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
    routeRevision: 1,
    routeDigest: "a".repeat(64),
    now: "2026-08-24T10:13:29.190Z",
  });

  assert.notEqual(allocation, null);
  if (allocation === null) throw new Error("allocation unexpectedly failed");
  assert.equal(allocation.created, true);
  assert.equal(allocation.run.current_node, "claim_issue");
  assert.equal(allocation.run.definition_version, 2);
});
