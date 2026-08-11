CREATE TABLE IF NOT EXISTS deliveries (
    delivery_id TEXT PRIMARY KEY,
    payload_hash TEXT NOT NULL,
    received_at TEXT NOT NULL,
    classification TEXT NOT NULL
);
