CREATE TABLE bounded_review_reconciliations (
  attempt_id TEXT PRIMARY KEY REFERENCES agent_attempts(attempt_id),
  run_id TEXT NOT NULL REFERENCES orchestration_runs(run_id),
  plan_digest TEXT NOT NULL,
  plan_json TEXT NOT NULL,
  original_recovery_json TEXT NOT NULL,
  transcript_r2_key TEXT NOT NULL,
  transcript_sha256 TEXT NOT NULL,
  recovery_sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL
);
