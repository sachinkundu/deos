-- Run only after the validation query reports zero missing or mismatched tiers.
DROP TRIGGER sandbox_tier_compatibility_delivery;
DROP TRIGGER sandbox_tier_compatibility_run;
DROP TRIGGER sandbox_tier_compatibility_attempt;
CREATE TRIGGER sandbox_tier_require_delivery BEFORE INSERT ON deliveries
WHEN NEW.sandbox_tier_policy_version IS NULL OR NEW.sandbox_tier_policy_version NOT IN ('legacy-basic-v1','event-label-v1')
BEGIN SELECT RAISE(ABORT,'delivery requires the release tier policy'); END;
CREATE TRIGGER sandbox_tier_require_run BEFORE INSERT ON orchestration_runs
WHEN NEW.sandbox_tier IS NULL OR NEW.sandbox_tier_source IS NULL OR NEW.sandbox_tier_policy_version IS NULL
 OR NOT ((NEW.sandbox_tier_policy_version='legacy-basic-v1' AND NEW.sandbox_tier='basic' AND NEW.sandbox_tier_source='legacy_basic')
 OR (NEW.sandbox_tier_policy_version='event-label-v1' AND
   ((NEW.sandbox_tier='basic' AND NEW.sandbox_tier_source='event_slow_ok')
    OR (NEW.sandbox_tier='standard-2' AND NEW.sandbox_tier_source='event_default_standard2'))))
BEGIN SELECT RAISE(ABORT,'run requires a valid sandbox tier'); END;
CREATE TRIGGER sandbox_tier_require_attempt BEFORE INSERT ON agent_attempts
WHEN NEW.sandbox_tier IS NULL OR NOT EXISTS
  (SELECT 1 FROM orchestration_runs r WHERE r.run_id=NEW.run_id AND r.sandbox_tier=NEW.sandbox_tier)
BEGIN SELECT RAISE(ABORT,'attempt requires the saved run tier'); END;
CREATE TRIGGER sandbox_tier_no_legacy_update BEFORE UPDATE OF sandbox_tier,sandbox_tier_source,sandbox_tier_policy_version ON orchestration_runs
WHEN OLD.sandbox_tier IS NOT NEW.sandbox_tier OR OLD.sandbox_tier_source IS NOT NEW.sandbox_tier_source
 OR OLD.sandbox_tier_policy_version IS NOT NEW.sandbox_tier_policy_version
BEGIN SELECT RAISE(ABORT,'run tier cannot change after activation'); END;
