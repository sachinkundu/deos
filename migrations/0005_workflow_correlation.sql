ALTER TABLE deliveries ADD COLUMN correlation_id TEXT;

UPDATE deliveries
SET correlation_id = delivery_id
WHERE correlation_id IS NULL;

UPDATE workflow_runs
SET correlation_id = run_id
WHERE correlation_id <> run_id;

CREATE INDEX IF NOT EXISTS deliveries_correlation_id
ON deliveries (correlation_id);
