-- A preparing lease becomes active only after each isolated Worker reports the
-- fixed staging source, build input, and base version it was created from.
CREATE TABLE test_service_readbacks (
  lease_id TEXT NOT NULL REFERENCES test_leases(lease_id),
  service_name TEXT NOT NULL,
  resource_id TEXT NOT NULL REFERENCES test_resources(resource_id),
  worker_name TEXT NOT NULL,
  canonical_host TEXT NOT NULL,
  source_commit TEXT NOT NULL,
  base_version_id TEXT NOT NULL,
  build_input_sha256 TEXT NOT NULL,
  running_version_id TEXT NOT NULL,
  fence INTEGER NOT NULL,
  read_at TEXT NOT NULL,
  PRIMARY KEY(lease_id,service_name),
  UNIQUE(lease_id,resource_id)
);

-- The final statement of the activation batch inserts ready=0 if any earlier
-- guarded write did not complete. The CHECK failure rolls back the full batch.
CREATE TABLE test_service_activation_guards (
  lease_id TEXT PRIMARY KEY REFERENCES test_leases(lease_id),
  ready INTEGER NOT NULL CHECK(ready=1),
  activated_at TEXT NOT NULL
);
