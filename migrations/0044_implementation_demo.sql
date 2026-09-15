CREATE TABLE implementation_demo_reviews (
  attempt_id TEXT PRIMARY KEY REFERENCES agent_attempts(attempt_id),
  run_id TEXT NOT NULL REFERENCES orchestration_runs(run_id),
  visit_sequence INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('plan','gate')),
  input_sha TEXT NOT NULL,
  plan_sha TEXT,
  candidate_sha TEXT,
  tested_base_sha TEXT NOT NULL,
  tree_sha TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK(outcome IN ('ready','pass','needs_work','blocked')),
  summary TEXT NOT NULL,
  payload_key TEXT NOT NULL,
  payload_sha TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(run_id,visit_sequence,kind)
);
CREATE INDEX implementation_demo_latest ON implementation_demo_reviews(run_id,kind,visit_sequence DESC);
CREATE TABLE implementation_demo_access (
  attempt_id TEXT NOT NULL REFERENCES agent_attempts(attempt_id),
  proof_id TEXT NOT NULL REFERENCES implementation_proof(proof_id),
  sha256 TEXT NOT NULL,
  opened_at TEXT NOT NULL,
  PRIMARY KEY(attempt_id,proof_id)
);
