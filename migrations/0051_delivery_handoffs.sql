-- Receipt and pending Queue message are committed together. Queue delivery is
-- at least once; the consumer's delivery-keyed inbox prevents repeated work.
CREATE TABLE delivery_handoffs (
  delivery_id TEXT PRIMARY KEY REFERENCES deliveries(delivery_id),
  payload_json TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','sent')),
  lease_id TEXT,
  lease_until TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  sent_at TEXT
);
CREATE INDEX delivery_handoffs_pending ON delivery_handoffs(state,lease_until);
CREATE TABLE delivery_handoff_errors (
  error_id TEXT PRIMARY KEY,
  delivery_id TEXT NOT NULL REFERENCES deliveries(delivery_id),
  occurred_at TEXT NOT NULL,
  diagnostic TEXT NOT NULL
);
