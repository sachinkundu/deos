CREATE TABLE agent_stage_retries_next (
    retry_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    failed_attempt_id TEXT NOT NULL UNIQUE,
    retry_node TEXT NOT NULL CHECK (
        retry_node IN ('planning_revision_author', 'independent_discovery', 'independent_recheck')
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
    FOREIGN KEY (run_id) REFERENCES orchestration_runs(run_id),
    FOREIGN KEY (failed_attempt_id) REFERENCES agent_attempts(attempt_id)
);

INSERT INTO agent_stage_retries_next (
    retry_id, run_id, failed_attempt_id, retry_node,
    from_visit_sequence, to_visit_sequence, transition_id, state,
    workflow_status, safe_error_category, requested_by, created_at, updated_at, established_at,
    retry_kind, source_definition_id, source_definition_version, source_definition_digest,
    target_definition_id, target_definition_version, target_definition_digest,
    source_workflow_instance_id, target_workflow_instance_id, source_delivery_id
)
SELECT
    retry_id, run_id, failed_attempt_id, retry_node,
    from_visit_sequence, to_visit_sequence, transition_id, state,
    workflow_status, safe_error_category, requested_by, created_at, updated_at, established_at,
    retry_kind, source_definition_id, source_definition_version, source_definition_digest,
    target_definition_id, target_definition_version, target_definition_digest,
    source_workflow_instance_id, target_workflow_instance_id, source_delivery_id
FROM agent_stage_retries;

DROP TABLE agent_stage_retries;
ALTER TABLE agent_stage_retries_next RENAME TO agent_stage_retries;

CREATE INDEX agent_stage_retries_run_created
ON agent_stage_retries (run_id, created_at);

CREATE UNIQUE INDEX agent_stage_retries_target_workflow_instance
ON agent_stage_retries (target_workflow_instance_id)
WHERE target_workflow_instance_id IS NOT NULL AND retry_kind = 'compatible_tail';
