-- Compatibility writers cover old deployed Workers during the release boundary.
-- The enforcement script removes these temporary null writers before activation.
ALTER TABLE deliveries ADD COLUMN start_slow_ok INTEGER CHECK (start_slow_ok IS NULL OR start_slow_ok = 1);
ALTER TABLE deliveries ADD COLUMN sandbox_tier_policy_version TEXT;
ALTER TABLE orchestration_runs ADD COLUMN sandbox_tier TEXT CHECK (sandbox_tier IN ('basic', 'standard-2'));
ALTER TABLE orchestration_runs ADD COLUMN sandbox_tier_source TEXT CHECK (sandbox_tier_source IN ('event_slow_ok', 'event_default_standard2', 'legacy_basic'));
ALTER TABLE orchestration_runs ADD COLUMN sandbox_tier_policy_version TEXT;
ALTER TABLE agent_attempts ADD COLUMN sandbox_tier TEXT CHECK (sandbox_tier IN ('basic', 'standard-2'));

CREATE TABLE start_dispatch_failures (
  delivery_id TEXT PRIMARY KEY,
  issue_id TEXT NOT NULL,
  issue_key TEXT NOT NULL,
  project_id TEXT NOT NULL,
  route_revision INTEGER,
  cause TEXT NOT NULL CHECK (cause IN ('delivery_missing','slow_ok_invalid','slow_ok_mismatch','tier_policy_unknown','tier_policy_mismatch')),
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  occurrence_count INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX start_dispatch_failures_project ON start_dispatch_failures(project_id,last_seen_at);

CREATE TABLE sandbox_tier_trials (comparison_id TEXT PRIMARY KEY,created_at TEXT NOT NULL);
CREATE TABLE sandbox_tier_trial_members (
  comparison_id TEXT NOT NULL REFERENCES sandbox_tier_trials(comparison_id),
  pair_id TEXT NOT NULL,
  issue_id TEXT NOT NULL UNIQUE,
  workload_digest TEXT NOT NULL,
  controls_digest TEXT NOT NULL,
  planned_tier TEXT NOT NULL CHECK (planned_tier IN ('basic','standard-2')),
  launch_order INTEGER NOT NULL,
  run_id TEXT UNIQUE REFERENCES orchestration_runs(run_id),
  created_at TEXT NOT NULL,
  PRIMARY KEY (comparison_id,pair_id,planned_tier)
);
CREATE TRIGGER sandbox_tier_trial_immutable BEFORE UPDATE ON sandbox_tier_trial_members
WHEN OLD.comparison_id IS NOT NEW.comparison_id OR OLD.pair_id IS NOT NEW.pair_id
 OR OLD.issue_id IS NOT NEW.issue_id OR OLD.workload_digest IS NOT NEW.workload_digest
 OR OLD.controls_digest IS NOT NEW.controls_digest OR OLD.planned_tier IS NOT NEW.planned_tier
 OR OLD.launch_order IS NOT NEW.launch_order OR OLD.created_at IS NOT NEW.created_at
 OR (OLD.run_id IS NOT NULL AND OLD.run_id IS NOT NEW.run_id)
BEGIN SELECT RAISE(ABORT, 'sandbox tier trial member is immutable'); END;
CREATE TRIGGER sandbox_tier_trial_bind AFTER INSERT ON orchestration_runs
BEGIN
  UPDATE sandbox_tier_trial_members SET run_id=NEW.run_id WHERE issue_id=NEW.issue_id AND run_id IS NULL;
END;
CREATE TRIGGER sandbox_tier_run_immutable BEFORE UPDATE ON orchestration_runs
WHEN OLD.sandbox_tier IS NOT NULL AND (OLD.sandbox_tier IS NOT NEW.sandbox_tier
 OR OLD.sandbox_tier_source IS NOT NEW.sandbox_tier_source
 OR OLD.sandbox_tier_policy_version IS NOT NEW.sandbox_tier_policy_version)
BEGIN SELECT RAISE(ABORT, 'sandbox run tier is immutable'); END;
CREATE TRIGGER sandbox_tier_attempt_immutable BEFORE UPDATE ON agent_attempts
WHEN OLD.sandbox_tier IS NOT NULL AND OLD.sandbox_tier IS NOT NEW.sandbox_tier
BEGIN SELECT RAISE(ABORT, 'sandbox attempt tier is immutable'); END;
CREATE TRIGGER sandbox_tier_delivery_immutable BEFORE UPDATE ON deliveries
WHEN OLD.start_slow_ok IS NOT NEW.start_slow_ok
 OR (OLD.sandbox_tier_policy_version IS NOT NULL AND OLD.sandbox_tier_policy_version IS NOT NEW.sandbox_tier_policy_version)
BEGIN SELECT RAISE(ABORT, 'accepted delivery tier evidence is immutable'); END;

CREATE TRIGGER sandbox_tier_compatibility_delivery AFTER INSERT ON deliveries
WHEN NEW.sandbox_tier_policy_version IS NULL
BEGIN
  UPDATE deliveries SET sandbox_tier_policy_version='legacy-basic-v1'
  WHERE delivery_id=NEW.delivery_id AND sandbox_tier_policy_version IS NULL;
END;
CREATE TRIGGER sandbox_tier_compatibility_run AFTER INSERT ON orchestration_runs
WHEN NEW.sandbox_tier IS NULL
BEGIN
  UPDATE orchestration_runs SET sandbox_tier='basic',sandbox_tier_source='legacy_basic',
    sandbox_tier_policy_version='legacy-basic-v1' WHERE run_id=NEW.run_id AND sandbox_tier IS NULL;
END;
CREATE TRIGGER sandbox_tier_compatibility_attempt AFTER INSERT ON agent_attempts
WHEN NEW.sandbox_tier IS NULL
BEGIN
  UPDATE agent_attempts SET sandbox_tier=(SELECT sandbox_tier FROM orchestration_runs WHERE run_id=NEW.run_id)
  WHERE attempt_id=NEW.attempt_id AND sandbox_tier IS NULL;
END;

UPDATE deliveries SET sandbox_tier_policy_version='legacy-basic-v1' WHERE sandbox_tier_policy_version IS NULL;
UPDATE orchestration_runs SET sandbox_tier='basic',sandbox_tier_source='legacy_basic',
  sandbox_tier_policy_version='legacy-basic-v1' WHERE sandbox_tier IS NULL;
UPDATE agent_attempts SET sandbox_tier=(SELECT sandbox_tier FROM orchestration_runs r WHERE r.run_id=agent_attempts.run_id)
WHERE sandbox_tier IS NULL;
