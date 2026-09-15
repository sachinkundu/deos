-- Extend the existing audited retry mechanism to the independent demo agents.
-- Rebuild the referenced tier table with its parent, preserving all rows and guards.
CREATE TABLE agent_stage_retries_demo_next (
    retry_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    failed_attempt_id TEXT NOT NULL UNIQUE,
    retry_node TEXT NOT NULL CHECK (
        retry_node IN (
            'planning_author', 'self_discovery', 'planning_self_repair',
            'self_recheck_before_publish', 'self_recheck_after_publish',
            'planning_revision_author', 'independent_discovery',
            'independent_recheck', 'planning_independent_response', 'final_trace',
            'design_author', 'design_revision_author', 'design_self_review',
            'design_independent_review', 'design_self_response',
            'design_independent_response', 'design_final_review',
            'implementation_tasks', 'implementation_build',
            'implementation_demo_plan', 'implementation_demo_gate'
        )
    ),
    from_visit_sequence INTEGER NOT NULL CHECK (from_visit_sequence > 0),
    to_visit_sequence INTEGER NOT NULL CHECK (to_visit_sequence = from_visit_sequence + 1),
    transition_id TEXT NOT NULL UNIQUE,
    state TEXT NOT NULL CHECK (state IN ('pending', 'established')),
    workflow_status TEXT,
    safe_error_category TEXT,
    requested_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    established_at TEXT,
    retry_kind TEXT NOT NULL DEFAULT 'same_definition'
        CHECK (retry_kind IN ('same_definition', 'compatible_tail')),
    source_definition_id TEXT,
    source_definition_version INTEGER,
    source_definition_digest TEXT,
    target_definition_id TEXT,
    target_definition_version INTEGER,
    target_definition_digest TEXT,
    source_workflow_instance_id TEXT,
    target_workflow_instance_id TEXT,
    source_delivery_id TEXT,
    entry_node TEXT CHECK (entry_node IS NULL OR entry_node = 'implementation_demo_plan'),
    FOREIGN KEY (run_id) REFERENCES orchestration_runs(run_id),
    FOREIGN KEY (failed_attempt_id) REFERENCES agent_attempts(attempt_id)
);

INSERT INTO agent_stage_retries_demo_next
SELECT * FROM agent_stage_retries;

CREATE TABLE implementation_retry_tiers_demo_next (
  retry_id TEXT PRIMARY KEY REFERENCES agent_stage_retries_demo_next(retry_id),
  source_sandbox_tier TEXT NOT NULL CHECK (source_sandbox_tier IN ('basic', 'standard-2')),
  target_sandbox_tier TEXT NOT NULL CHECK (target_sandbox_tier IN ('basic', 'standard-2'))
);
INSERT INTO implementation_retry_tiers_demo_next SELECT * FROM implementation_retry_tiers;
DROP TRIGGER IF EXISTS sandbox_tier_require_attempt;
DROP TABLE implementation_retry_tiers;
DROP TABLE agent_stage_retries;
ALTER TABLE agent_stage_retries_demo_next RENAME TO agent_stage_retries;
ALTER TABLE implementation_retry_tiers_demo_next RENAME TO implementation_retry_tiers;

CREATE INDEX agent_stage_retries_run_created
ON agent_stage_retries (run_id, created_at);

CREATE UNIQUE INDEX agent_stage_retries_target_workflow_instance
ON agent_stage_retries (target_workflow_instance_id)
WHERE target_workflow_instance_id IS NOT NULL AND retry_kind = 'compatible_tail';

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
