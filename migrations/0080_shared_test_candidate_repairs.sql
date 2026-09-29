CREATE TABLE test_candidate_repairs (
  repair_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES implementation_runs(run_id),
  retired_lease_id TEXT NOT NULL UNIQUE REFERENCES test_lease_aborts(lease_id),
  source_commit TEXT NOT NULL,
  target_commit TEXT NOT NULL,
  source_candidate_key TEXT NOT NULL,
  source_candidate_sha256 TEXT NOT NULL,
  source_patch_key TEXT NOT NULL,
  source_patch_sha256 TEXT NOT NULL,
  source_tree_sha TEXT NOT NULL,
  target_candidate_key TEXT NOT NULL,
  target_candidate_sha256 TEXT NOT NULL,
  target_patch_key TEXT NOT NULL,
  target_patch_sha256 TEXT NOT NULL,
  target_tree_sha TEXT NOT NULL,
  tested_base_sha TEXT NOT NULL,
  committed_at TEXT NOT NULL
);
CREATE TABLE test_candidate_repair_guards (
  repair_id TEXT PRIMARY KEY REFERENCES test_candidate_repairs(repair_id),
  ready INTEGER NOT NULL CHECK(ready=1)
);
