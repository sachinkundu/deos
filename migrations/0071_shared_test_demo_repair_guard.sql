CREATE TABLE test_demo_repair_retry_guards (
  request_id TEXT PRIMARY KEY REFERENCES test_demo_repair_retries(request_id),
  ready INTEGER NOT NULL CHECK(ready=1)
);
