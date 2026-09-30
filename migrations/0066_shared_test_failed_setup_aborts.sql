-- A failed setup can close after its own proof and owned-resource absence.
-- This receipt cannot satisfy a successful test attestation.
CREATE TABLE test_lease_aborts (
  lease_id TEXT PRIMARY KEY REFERENCES test_leases(lease_id),
  run_id TEXT NOT NULL,
  first_fault_id TEXT NOT NULL REFERENCES test_failures(fault_id),
  proof_body_sha256 TEXT NOT NULL,
  proof_read_at TEXT NOT NULL,
  cleanup_sha256 TEXT,
  absence_sha256 TEXT,
  closed_at TEXT,
  receipt_json TEXT CHECK(receipt_json IS NULL OR json_valid(receipt_json))
);

CREATE TABLE test_lease_abort_guards (
  lease_id TEXT PRIMARY KEY REFERENCES test_leases(lease_id),
  ready INTEGER NOT NULL CHECK(ready=1),
  checked_at TEXT NOT NULL
);
