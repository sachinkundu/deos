SELECT
 (SELECT count(*) FROM orchestration_runs WHERE sandbox_tier IS NULL OR sandbox_tier NOT IN ('basic','standard-2')
   OR sandbox_tier_source IS NULL OR sandbox_tier_policy_version IS NULL) AS invalid_runs,
 (SELECT count(*) FROM agent_attempts a LEFT JOIN orchestration_runs r ON r.run_id=a.run_id
   WHERE a.sandbox_tier IS NULL OR r.sandbox_tier IS NULL OR a.sandbox_tier<>r.sandbox_tier) AS invalid_attempts,
 (SELECT count(*) FROM deliveries WHERE classification='relevant' AND sandbox_tier_policy_version IS NULL) AS unversioned_deliveries;
