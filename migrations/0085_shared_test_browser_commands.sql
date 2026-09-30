-- Browser maintenance and page actions must never connect to one session at
-- the same time. Short API calls cannot safely share a Puppeteer connection.
CREATE TABLE test_browser_command_locks (
  lease_id TEXT NOT NULL REFERENCES test_leases(lease_id),
  service_name TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  PRIMARY KEY(lease_id,service_name)
);
