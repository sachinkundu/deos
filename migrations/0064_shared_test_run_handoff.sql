-- One exact frozen-run to new-run transfer. This records provenance; it does
-- not turn the source workflow or its historical approvals into a test result.
CREATE TABLE IF NOT EXISTS shared_test_run_handoffs (
  source_run_id TEXT PRIMARY KEY,
  target_run_id TEXT NOT NULL UNIQUE,
  source_workflow_instance_id TEXT NOT NULL,
  target_workflow_instance_id TEXT NOT NULL UNIQUE,
  source_definition_digest TEXT NOT NULL,
  target_definition_digest TEXT NOT NULL,
  source_candidate_commit TEXT NOT NULL,
  target_candidate_commit TEXT NOT NULL,
  source_patch_sha256 TEXT NOT NULL,
  target_patch_sha256 TEXT NOT NULL,
  source_candidate_sha256 TEXT NOT NULL,
  target_candidate_sha256 TEXT NOT NULL,
  target_base_commit TEXT NOT NULL,
  target_tree_sha TEXT NOT NULL,
  pull_request_number INTEGER NOT NULL,
  planning_merge_commit TEXT NOT NULL,
  design_merge_commit TEXT NOT NULL,
  plan_digest TEXT NOT NULL,
  plan_json TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('prepared','admitted','dispatched')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
