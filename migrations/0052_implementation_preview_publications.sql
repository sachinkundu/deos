CREATE TABLE implementation_preview_publications (
  publication_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES implementation_runs(run_id),
  attempt_id TEXT NOT NULL REFERENCES agent_attempts(attempt_id),
  tree_sha TEXT NOT NULL,
  bundle_key TEXT NOT NULL,
  bundle_sha TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('uploading','creating','ready')),
  deployment_id TEXT,
  receipt_key TEXT,
  receipt_sha TEXT,
  created_at TEXT NOT NULL
);
