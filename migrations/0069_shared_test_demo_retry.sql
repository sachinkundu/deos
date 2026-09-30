-- A single exact retry after a terminal demo attempt whose launch failed.
CREATE TABLE test_demo_attempt_retries (
  lease_id TEXT PRIMARY KEY REFERENCES test_leases(lease_id),
  run_id TEXT NOT NULL,
  old_attempt_id TEXT NOT NULL,
  new_attempt_id TEXT NOT NULL UNIQUE,
  fault_id TEXT NOT NULL REFERENCES test_failures(fault_id),
  browser_session_id TEXT,
  committed_at TEXT NOT NULL
);
CREATE TABLE test_demo_retry_guards (
  lease_id TEXT PRIMARY KEY REFERENCES test_leases(lease_id),
  ready INTEGER NOT NULL CHECK(ready=1)
);
