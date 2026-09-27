CREATE TABLE IF NOT EXISTS test_candidate_service_readbacks (
  lease_id TEXT NOT NULL,
  service_name TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  candidate_commit TEXT NOT NULL,
  build_input_sha256 TEXT NOT NULL,
  running_version_id TEXT NOT NULL,
  fence INTEGER NOT NULL,
  first_read_at TEXT NOT NULL,
  second_read_at TEXT NOT NULL,
  PRIMARY KEY (lease_id, service_name),
  FOREIGN KEY (lease_id) REFERENCES test_leases(lease_id)
);
