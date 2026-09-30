CREATE TABLE test_candidate_edge_refreshes (
  lease_id TEXT NOT NULL REFERENCES test_leases(lease_id),
  service_name TEXT NOT NULL,
  candidate_commit TEXT NOT NULL,
  build_input_sha256 TEXT NOT NULL,
  previous_version_id TEXT NOT NULL,
  running_version_id TEXT,
  state TEXT NOT NULL CHECK(state IN ('planned','refreshing','deployed','confirmed')),
  claim_token TEXT,
  claim_until TEXT,
  planned_at TEXT NOT NULL,
  deployed_at TEXT,
  confirmed_at TEXT,
  PRIMARY KEY (lease_id,service_name)
);
