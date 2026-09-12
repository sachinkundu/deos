-- Run only after compatibility writers are active. Never derive old labels from Linear.
UPDATE deliveries SET sandbox_tier_policy_version='legacy-basic-v1'
WHERE sandbox_tier_policy_version IS NULL;
UPDATE orchestration_runs SET sandbox_tier='basic',sandbox_tier_source='legacy_basic',
  sandbox_tier_policy_version='legacy-basic-v1' WHERE sandbox_tier IS NULL;
UPDATE agent_attempts SET sandbox_tier=(SELECT sandbox_tier FROM orchestration_runs r WHERE r.run_id=agent_attempts.run_id)
WHERE sandbox_tier IS NULL;
