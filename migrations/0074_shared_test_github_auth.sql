-- OAuth state and encrypted GitHub user sessions belong only to the trusted
-- coordinator. Candidate Workers receive an opaque, short-lived session flag.
CREATE TABLE test_github_oauth_states (
  state_sha256 TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  attempt_id TEXT NOT NULL,
  lease_id TEXT NOT NULL REFERENCES test_leases(lease_id),
  fence INTEGER NOT NULL,
  origin TEXT NOT NULL,
  app_session_sha256 TEXT NOT NULL REFERENCES test_app_sessions(session_sha256),
  return_to TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  claimed_at TEXT,
  handoff_sha256 TEXT UNIQUE,
  handoff_expires_at TEXT,
  handoff_used_at TEXT,
  handoff_session_sha256 TEXT UNIQUE,
  token_ciphertext TEXT,
  token_nonce TEXT,
  token_expires_at TEXT,
  failure_json TEXT
);
CREATE INDEX test_github_oauth_states_lease ON test_github_oauth_states(lease_id);

CREATE TABLE test_github_sessions (
  session_sha256 TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  attempt_id TEXT NOT NULL,
  lease_id TEXT NOT NULL REFERENCES test_leases(lease_id),
  fence INTEGER NOT NULL,
  origin TEXT NOT NULL,
  app_session_sha256 TEXT NOT NULL REFERENCES test_app_sessions(session_sha256),
  token_ciphertext TEXT NOT NULL,
  token_nonce TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE INDEX test_github_sessions_lease ON test_github_sessions(lease_id);

CREATE TABLE test_github_transport_requests (
  request_id TEXT PRIMARY KEY,
  lease_id TEXT NOT NULL REFERENCES test_leases(lease_id),
  fence INTEGER NOT NULL,
  repository TEXT NOT NULL,
  pull_request_number INTEGER NOT NULL,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  provider_status INTEGER,
  failure_json TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT
);
CREATE INDEX test_github_transport_requests_lease ON test_github_transport_requests(lease_id);
