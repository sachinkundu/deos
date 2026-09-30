-- Shared demo attempts are not build attempts. Keep their disposable provider
-- resources in a lease ledger rather than inventing an implementation try.
CREATE TABLE test_review_fixtures (
  resource_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES orchestration_runs(run_id),
  attempt_id TEXT NOT NULL,
  lease_id TEXT NOT NULL REFERENCES test_leases(lease_id),
  kind TEXT NOT NULL CHECK(kind='safe_test'),
  slot_id TEXT NOT NULL UNIQUE,
  allocation_op TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL CHECK(provider='github-linear-review-v1'),
  provider_resource_id TEXT UNIQUE,
  namespace TEXT UNIQUE,
  status TEXT NOT NULL CHECK(status IN ('allocating','ready','quarantined','destroyed')),
  metadata_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(metadata_json)),
  cleanup_receipt TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(lease_id,attempt_id)
);
CREATE TABLE test_review_fixture_operations (
  operation_id TEXT PRIMARY KEY,
  resource_id TEXT NOT NULL REFERENCES test_review_fixtures(resource_id),
  request_sha TEXT NOT NULL,
  request_json TEXT NOT NULL CHECK(json_valid(request_json)),
  state TEXT NOT NULL CHECK(state IN ('started','completed','uncertain')),
  response_json TEXT CHECK(response_json IS NULL OR json_valid(response_json)),
  prior_state_id TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE TABLE test_review_fixture_events (
  delivery_id TEXT PRIMARY KEY REFERENCES deliveries(delivery_id),
  resource_id TEXT NOT NULL REFERENCES test_review_fixtures(resource_id),
  issue_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  from_state_id TEXT,
  to_state_id TEXT NOT NULL,
  provider_time TEXT NOT NULL,
  payload_sha TEXT NOT NULL,
  received_at TEXT NOT NULL
);
