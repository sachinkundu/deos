CREATE TABLE IF NOT EXISTS test_route_mismatch_diagnostics (
  delivery_id TEXT PRIMARY KEY,
  expectation_id TEXT NOT NULL,
  checks_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
