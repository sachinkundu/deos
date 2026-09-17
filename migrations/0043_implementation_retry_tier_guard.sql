-- Retain the release guard and allow only the tier recorded by a trusted retry.
DROP TRIGGER IF EXISTS sandbox_tier_require_attempt;
CREATE TRIGGER sandbox_tier_require_attempt BEFORE INSERT ON agent_attempts
WHEN (NEW.sandbox_tier IS NULL AND NOT EXISTS (
    SELECT 1 FROM sqlite_schema WHERE type='trigger' AND name='sandbox_tier_compatibility_attempt'))
  OR (NEW.sandbox_tier IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM orchestration_runs AS run WHERE run.run_id=NEW.run_id
      AND NEW.sandbox_tier=COALESCE((
        SELECT tiers.target_sandbox_tier FROM agent_stage_retries AS retry
        JOIN implementation_retry_tiers AS tiers ON tiers.retry_id=retry.retry_id
        WHERE retry.run_id=NEW.run_id AND retry.to_visit_sequence<=NEW.visit_sequence
        ORDER BY retry.to_visit_sequence DESC LIMIT 1), run.sandbox_tier)))
BEGIN SELECT RAISE(ABORT,'attempt requires the saved run tier or an audited recovery tier'); END;
