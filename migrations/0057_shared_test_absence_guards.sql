-- The final statement of a D1 batch fails if either absence write was skipped.
-- D1 rolls back the preceding resource and cleanup-check writes with it.
CREATE TABLE test_resource_absence_guards (
  lease_id TEXT NOT NULL REFERENCES test_leases(lease_id),
  resource_id TEXT NOT NULL REFERENCES test_resources(resource_id),
  ready INTEGER NOT NULL CHECK(ready=1),
  checked_at TEXT NOT NULL,
  PRIMARY KEY(lease_id,resource_id)
);

CREATE TABLE test_close_transaction_guards (
  lease_id TEXT PRIMARY KEY REFERENCES test_leases(lease_id),
  ready INTEGER NOT NULL CHECK(ready=1),
  checked_at TEXT NOT NULL
);
