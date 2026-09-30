CREATE TABLE test_browser_sessions (
  lease_id TEXT NOT NULL REFERENCES test_leases(lease_id),
  service_name TEXT NOT NULL,
  run_id TEXT NOT NULL,
  attempt_id TEXT NOT NULL,
  fence INTEGER NOT NULL,
  origin TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN
    ('planned','creating','ready','retiring','absent','uncertain')),
  operation_id TEXT NOT NULL,
  inventory_json TEXT CHECK(inventory_json IS NULL OR json_valid(inventory_json)),
  create_window TEXT,
  session_id TEXT,
  prepared_until TEXT,
  absent_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (lease_id,service_name)
);
CREATE UNIQUE INDEX test_browser_session_identity
  ON test_browser_sessions(session_id) WHERE session_id IS NOT NULL;
