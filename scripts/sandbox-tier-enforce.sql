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
DROP TRIGGER IF EXISTS sandbox_tier_require_attempt;
CREATE TRIGGER sandbox_tier_require_attempt BEFORE INSERT ON agent_attempts
WHEN NEW.sandbox_tier IS NULL OR NOT EXISTS
  (SELECT 1 FROM orchestration_runs r WHERE r.run_id=NEW.run_id AND NEW.sandbox_tier=COALESCE((
    SELECT tiers.target_sandbox_tier FROM agent_stage_retries AS retry
    JOIN implementation_retry_tiers AS tiers ON tiers.retry_id=retry.retry_id
    WHERE retry.run_id=NEW.run_id AND retry.to_visit_sequence<=NEW.visit_sequence
    ORDER BY retry.to_visit_sequence DESC LIMIT 1),r.sandbox_tier))
BEGIN SELECT RAISE(ABORT,'attempt requires the saved run tier or an audited recovery tier'); END;
CREATE TRIGGER sandbox_tier_no_legacy_update BEFORE UPDATE OF sandbox_tier,sandbox_tier_source,sandbox_tier_policy_version ON orchestration_runs
WHEN OLD.sandbox_tier IS NOT NEW.sandbox_tier OR OLD.sandbox_tier_source IS NOT NEW.sandbox_tier_source
 OR OLD.sandbox_tier_policy_version IS NOT NEW.sandbox_tier_policy_version
BEGIN SELECT RAISE(ABORT,'run tier cannot change after activation'); END;
