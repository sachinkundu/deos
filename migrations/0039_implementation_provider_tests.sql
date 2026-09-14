CREATE TABLE implementation_test_profiles (
  run_id TEXT PRIMARY KEY REFERENCES orchestration_runs(run_id),
  adapter_binding TEXT NOT NULL,
  profile_json TEXT NOT NULL CHECK(json_valid(profile_json)),
  profile_sha TEXT NOT NULL,
  checked_at TEXT NOT NULL,
  checked_by TEXT NOT NULL
);
CREATE TABLE implementation_test_operations (
  operation_id TEXT PRIMARY KEY,
  resource_id TEXT NOT NULL REFERENCES implementation_resources(resource_id),
  request_sha TEXT NOT NULL,
  request_json TEXT NOT NULL CHECK(json_valid(request_json)),
  state TEXT NOT NULL CHECK(state IN ('started','completed','uncertain')),
  response_json TEXT CHECK(response_json IS NULL OR json_valid(response_json)),
  prior_state_id TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE TABLE implementation_test_events (
  delivery_id TEXT PRIMARY KEY REFERENCES deliveries(delivery_id),
  resource_id TEXT NOT NULL REFERENCES implementation_resources(resource_id),
  issue_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  from_state_id TEXT,
  to_state_id TEXT NOT NULL,
  provider_time TEXT NOT NULL,
  payload_sha TEXT NOT NULL,
  received_at TEXT NOT NULL
);
