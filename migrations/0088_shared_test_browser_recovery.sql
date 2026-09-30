-- One explicit replacement per service and attempt, only after provider absence.
-- The old ownership record and provider close facts survive the replacement.
CREATE TABLE test_browser_replacements (
  lease_id TEXT NOT NULL REFERENCES test_leases(lease_id),
  service_name TEXT NOT NULL,
  attempt_id TEXT NOT NULL,
  fence INTEGER NOT NULL,
  previous_session_id TEXT NOT NULL,
  previous_row_json TEXT NOT NULL,
  provider_history_json TEXT NOT NULL,
  absent_at TEXT NOT NULL,
  PRIMARY KEY (lease_id,service_name,attempt_id)
);
