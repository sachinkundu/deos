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

CREATE TABLE IF NOT EXISTS test_candidate_deploy_operations (
  lease_id TEXT NOT NULL REFERENCES test_leases(lease_id),
  service_name TEXT NOT NULL,
  candidate_commit TEXT NOT NULL,
  build_input_sha256 TEXT NOT NULL,
  operation_id TEXT,
  lease_until TEXT,
  state TEXT NOT NULL CHECK(state IN ('planned','deploying','confirmed')),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (lease_id, service_name)
);

CREATE TABLE IF NOT EXISTS test_candidate_build_requests (
  lease_id TEXT PRIMARY KEY REFERENCES test_leases(lease_id),
  run_id TEXT NOT NULL,
  candidate_commit TEXT NOT NULL,
  request_id TEXT NOT NULL,
  dispatch_count INTEGER NOT NULL DEFAULT 0 CHECK(dispatch_count BETWEEN 0 AND 3),
  last_dispatch_at TEXT,
  created_at TEXT NOT NULL
);
