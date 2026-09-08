CREATE TABLE IF NOT EXISTS workflow_errors (
  error_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  node_id TEXT,
  visit_sequence INTEGER,
  step_name TEXT NOT NULL,
  location TEXT NOT NULL,
  message TEXT NOT NULL,
  detail_r2_key TEXT NOT NULL,
  occurred_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS workflow_errors_run_time ON workflow_errors(run_id, occurred_at);
