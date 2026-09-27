CREATE TABLE test_app_launch_codes (
  code_sha256 TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  attempt_id TEXT NOT NULL,
  lease_id TEXT NOT NULL REFERENCES test_leases(lease_id),
  fence INTEGER NOT NULL,
  origin TEXT NOT NULL,
  access_identity_id TEXT NOT NULL REFERENCES test_access_identities(identity_id),
  principal_sha256 TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  session_sha256 TEXT UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE test_app_launch_guards (
  code_sha256 TEXT PRIMARY KEY REFERENCES test_app_launch_codes(code_sha256),
  session_sha256 TEXT NOT NULL,
  ready INTEGER NOT NULL CHECK(ready=1),
  redeemed_at TEXT NOT NULL
);
