CREATE TABLE test_review_runtimes (
  lease_id TEXT PRIMARY KEY REFERENCES test_leases(lease_id),
  run_id TEXT NOT NULL,
  attempt_id TEXT NOT NULL,
  fence INTEGER NOT NULL,
  candidate_commit TEXT NOT NULL,
  compiled_sha256 TEXT NOT NULL,
  worker_name TEXT NOT NULL UNIQUE,
  workflow_name TEXT NOT NULL UNIQUE,
  hostname TEXT NOT NULL UNIQUE,
  version_id TEXT,
  verified_at TEXT,
  absent_at TEXT
);
