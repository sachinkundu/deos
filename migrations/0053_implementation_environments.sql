CREATE TABLE implementation_environments (
  attempt_id TEXT PRIMARY KEY REFERENCES implementation_tries(attempt_id),
  run_id TEXT NOT NULL REFERENCES implementation_runs(run_id),
  name TEXT NOT NULL UNIQUE,
  account_id TEXT NOT NULL,
  config_json TEXT NOT NULL CHECK(json_valid(config_json)),
  resources_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(resources_json)),
  state TEXT NOT NULL DEFAULT 'allocating' CHECK(state IN ('allocating','ready','retiring','destroyed')),
  bundle_key TEXT, bundle_sha TEXT, receipt_key TEXT, receipt_sha TEXT,
  origin TEXT, lease_id TEXT, lease_until TEXT,
  cleanup_receipt TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX implementation_environments_run ON implementation_environments(run_id,state);
