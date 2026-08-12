CREATE TABLE IF NOT EXISTS queue_consumptions (
    consumption_id TEXT PRIMARY KEY,
    batch_size INTEGER NOT NULL,
    received_at TEXT NOT NULL
);
