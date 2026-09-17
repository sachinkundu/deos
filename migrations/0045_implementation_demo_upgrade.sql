-- A failed build may re-enter through its new independent demo plan. Keep the
-- failed stage and full source/target identities in the existing retry audit.
ALTER TABLE agent_stage_retries ADD COLUMN entry_node TEXT
  CHECK (entry_node IS NULL OR entry_node = 'implementation_demo_plan');
CREATE TABLE implementation_demo_upgrades (
  failed_attempt_id TEXT PRIMARY KEY REFERENCES agent_attempts(attempt_id),
  run_id TEXT NOT NULL REFERENCES orchestration_runs(run_id),
  plan_digest TEXT NOT NULL,
  plan_json TEXT NOT NULL,
  source_definition_digest TEXT NOT NULL,
  target_definition_digest TEXT NOT NULL,
  approved_input_sha TEXT NOT NULL,
  tested_base_sha TEXT NOT NULL,
  patch_sha TEXT,
  created_at TEXT NOT NULL
);
CREATE TRIGGER implementation_demo_upgrade_immutable BEFORE UPDATE ON implementation_demo_upgrades
BEGIN SELECT RAISE(ABORT,'demo upgrade audit is immutable'); END;

-- Keep legacy portal UNION queries compatible during the backend-first rollout.
ALTER TABLE publication_stage_retries ADD COLUMN entry_node TEXT CHECK (entry_node IS NULL);
