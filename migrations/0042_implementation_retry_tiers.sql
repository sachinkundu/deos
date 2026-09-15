-- A recovery may explicitly give future implementation attempts more resources.
-- Keep the accepted delivery, original run tier, and prior attempt tiers frozen.
CREATE TABLE implementation_retry_tiers (
  retry_id TEXT PRIMARY KEY REFERENCES agent_stage_retries(retry_id),
  source_sandbox_tier TEXT NOT NULL CHECK (source_sandbox_tier IN ('basic', 'standard-2')),
  target_sandbox_tier TEXT NOT NULL CHECK (target_sandbox_tier IN ('basic', 'standard-2'))
);

CREATE TRIGGER stage_retry_tier_immutable BEFORE UPDATE ON implementation_retry_tiers
WHEN OLD.source_sandbox_tier IS NOT NEW.source_sandbox_tier
  OR OLD.target_sandbox_tier IS NOT NEW.target_sandbox_tier
  OR OLD.retry_id IS NOT NEW.retry_id
BEGIN SELECT RAISE(ABORT, 'sandbox retry tier is immutable'); END;

CREATE TRIGGER stage_retry_tier_valid BEFORE INSERT ON implementation_retry_tiers
WHEN NOT EXISTS (SELECT 1 FROM agent_stage_retries AS retry
  JOIN agent_attempts AS attempt ON attempt.attempt_id = retry.failed_attempt_id AND attempt.run_id = retry.run_id
  WHERE retry.retry_id = NEW.retry_id AND attempt.sandbox_tier = NEW.source_sandbox_tier
    AND (NEW.source_sandbox_tier = NEW.target_sandbox_tier OR (
      retry.retry_node IN ('implementation_tasks', 'implementation_build')
      AND NEW.source_sandbox_tier = 'basic' AND NEW.target_sandbox_tier = 'standard-2'
    )))
BEGIN SELECT RAISE(ABORT, 'sandbox retry tier is invalid'); END;
