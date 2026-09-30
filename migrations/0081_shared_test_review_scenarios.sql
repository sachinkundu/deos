ALTER TABLE test_review_fixture_events ADD COLUMN actor_type TEXT;
ALTER TABLE test_browser_sessions ADD COLUMN viewport_width INTEGER NOT NULL DEFAULT 1440;
ALTER TABLE test_browser_sessions ADD COLUMN viewport_height INTEGER NOT NULL DEFAULT 900;
CREATE TABLE test_review_scenarios (
  lease_id TEXT NOT NULL REFERENCES test_leases(lease_id),
  scenario_id TEXT NOT NULL,
  scenario_run_id TEXT,
  state TEXT NOT NULL CHECK(state IN ('preparing','ready','retired')),
  prepared_at TEXT,
  PRIMARY KEY(lease_id,scenario_id)
);
CREATE UNIQUE INDEX test_review_one_scenario ON test_review_scenarios(lease_id)
  WHERE state IN ('preparing','ready');
CREATE TABLE test_review_forwarded_events (
  lease_id TEXT NOT NULL,
  scenario_id TEXT NOT NULL,
  delivery_id TEXT NOT NULL REFERENCES test_review_fixture_events(delivery_id),
  forwarded_at TEXT NOT NULL,
  PRIMARY KEY(lease_id,scenario_id,delivery_id),
  FOREIGN KEY(lease_id,scenario_id) REFERENCES test_review_scenarios(lease_id,scenario_id)
);
CREATE TABLE test_review_fault_injections (
  injection_id TEXT PRIMARY KEY,
  lease_id TEXT NOT NULL,
  scenario_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('github_reject_review','github_drop_reply_response','github_advance_after_reply',
    'linear_reject_move','account_identity_mismatch','hold_linear_delivery')),
  state TEXT NOT NULL CHECK(state IN ('armed','consumed','cleared')),
  request_id TEXT,
  armed_at TEXT NOT NULL,
  used_at TEXT,
  FOREIGN KEY(lease_id,scenario_id) REFERENCES test_review_scenarios(lease_id,scenario_id)
);
CREATE UNIQUE INDEX test_review_one_fault ON test_review_fault_injections(lease_id,kind) WHERE state='armed';
