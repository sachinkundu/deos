CREATE TABLE phase_review_cycles (
  run_id TEXT NOT NULL REFERENCES orchestration_runs(run_id),
  phase TEXT NOT NULL CHECK (phase IN ('planning', 'design')),
  schema_version TEXT NOT NULL,
  origin_attempt_id TEXT NOT NULL REFERENCES agent_attempts(attempt_id),
  revision INTEGER NOT NULL DEFAULT 0,
  state_json TEXT NOT NULL,
  state_sha256 TEXT NOT NULL,
  initial_state_sha256 TEXT NOT NULL,
  journal_manifest_id TEXT NOT NULL REFERENCES artifact_manifests(manifest_id),
  PRIMARY KEY (run_id, phase)
);
CREATE TABLE bounded_review_gate_bindings (
  run_id TEXT NOT NULL REFERENCES orchestration_runs(run_id),
  phase TEXT NOT NULL CHECK (phase IN ('planning', 'design')),
  visit_sequence INTEGER NOT NULL,
  state_sha256 TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  PRIMARY KEY (run_id, phase, visit_sequence)
);
CREATE TABLE review_transcript_owners (
  owner_kind TEXT NOT NULL CHECK (owner_kind IN ('author_attempt', 'native_child_invocation', 'independent_review_attempt')),
  owner_id TEXT NOT NULL,
  attempt_id TEXT NOT NULL REFERENCES agent_attempts(attempt_id),
  parent_attempt_id TEXT REFERENCES agent_attempts(attempt_id),
  manifest_id TEXT NOT NULL REFERENCES artifact_manifests(manifest_id),
  logical_name TEXT NOT NULL,
  child_index INTEGER,
  sha256 TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
  event_count INTEGER NOT NULL CHECK (event_count >= 0),
  format_version TEXT NOT NULL,
  PRIMARY KEY (owner_kind, owner_id)
);
CREATE TABLE review_portal_readiness (
  schema_version TEXT PRIMARY KEY,
  transcript_schema TEXT NOT NULL,
  portal_version_id TEXT NOT NULL,
  verified_at TEXT NOT NULL
);
CREATE TABLE bounded_review_collections (
  attempt_id TEXT PRIMARY KEY REFERENCES agent_attempts(attempt_id),
  job_spec_digest TEXT NOT NULL,
  manifest_id TEXT NOT NULL REFERENCES artifact_manifests(manifest_id),
  r2_key TEXT NOT NULL,
  sha256 TEXT NOT NULL
);
CREATE TABLE bounded_review_recoveries (
  attempt_id TEXT PRIMARY KEY REFERENCES agent_attempts(attempt_id),
  eligible INTEGER NOT NULL CHECK (eligible IN (0, 1)),
  recovery_json TEXT NOT NULL,
  sha256 TEXT NOT NULL
);
