CREATE TABLE implementation_handoffs (
  handoff_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES orchestration_runs(run_id),
  plan_digest TEXT NOT NULL,
  plan_json TEXT NOT NULL CHECK(json_valid(plan_json)),
  state TEXT NOT NULL CHECK(state IN ('prepared','applied','established')),
  target_workflow_instance_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
