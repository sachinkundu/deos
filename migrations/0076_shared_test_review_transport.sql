CREATE TABLE test_review_provider_requests (
  request_id TEXT PRIMARY KEY,
  lease_id TEXT NOT NULL REFERENCES test_leases(lease_id),
  fence INTEGER NOT NULL,
  resource_id TEXT NOT NULL REFERENCES test_review_fixtures(resource_id),
  method TEXT NOT NULL,
  target TEXT NOT NULL,
  provider_status INTEGER,
  failure_json TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT
);
CREATE INDEX test_review_provider_requests_lease ON test_review_provider_requests(lease_id);
