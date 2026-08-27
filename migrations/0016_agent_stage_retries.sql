CREATE TABLE IF NOT EXISTS agent_stage_retries (
    retry_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    failed_attempt_id TEXT NOT NULL UNIQUE,
    retry_node TEXT NOT NULL CHECK (retry_node IN ('independent_discovery', 'independent_recheck')),
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
    FOREIGN KEY (run_id) REFERENCES orchestration_runs(run_id),
    FOREIGN KEY (failed_attempt_id) REFERENCES agent_attempts(attempt_id)
);

CREATE INDEX IF NOT EXISTS agent_stage_retries_run_created
ON agent_stage_retries (run_id, created_at);
