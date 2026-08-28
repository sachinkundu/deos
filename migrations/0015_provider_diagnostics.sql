ALTER TABLE diagnostics ADD COLUMN operation_id TEXT;
ALTER TABLE diagnostics ADD COLUMN provider TEXT;
ALTER TABLE diagnostics ADD COLUMN failure_stage TEXT;
ALTER TABLE diagnostics ADD COLUMN http_status INTEGER;
ALTER TABLE diagnostics ADD COLUMN provider_code TEXT;
ALTER TABLE diagnostics ADD COLUMN provider_type TEXT;
ALTER TABLE diagnostics ADD COLUMN provider_request_id TEXT;
ALTER TABLE diagnostics ADD COLUMN response_content_type TEXT;
ALTER TABLE diagnostics ADD COLUMN response_body_sha256 TEXT;
ALTER TABLE diagnostics ADD COLUMN response_truncated INTEGER CHECK (response_truncated IN (0, 1));
ALTER TABLE diagnostics ADD COLUMN request_may_have_succeeded INTEGER CHECK (request_may_have_succeeded IN (0, 1));
ALTER TABLE diagnostics ADD COLUMN retryable INTEGER CHECK (retryable IN (0, 1));
ALTER TABLE diagnostics ADD COLUMN safe_message TEXT;

CREATE UNIQUE INDEX diagnostics_provider_operation
ON diagnostics (operation_id)
WHERE operation_id IS NOT NULL;

CREATE TABLE openrouter_response_receipts (
    operation_id TEXT PRIMARY KEY,
    r2_key TEXT NOT NULL UNIQUE,
    response_sha256 TEXT NOT NULL,
    http_status INTEGER NOT NULL,
    content_type TEXT NOT NULL,
    provider_request_id TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (operation_id) REFERENCES provider_operations(operation_id)
);

ALTER TABLE trace_reviews ADD COLUMN agent_harness TEXT;
ALTER TABLE trace_reviews ADD COLUMN agent_harness_version TEXT;
