CREATE TABLE workflow_runtime_recoveries_next (
    recovery_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    retry_node TEXT NOT NULL CHECK (length(retry_node) BETWEEN 1 AND 128),
    from_visit_sequence INTEGER NOT NULL CHECK (from_visit_sequence > 0),
    to_visit_sequence INTEGER NOT NULL CHECK (to_visit_sequence = from_visit_sequence + 1),
    transition_id TEXT NOT NULL UNIQUE,
    state TEXT NOT NULL CHECK (state IN ('pending', 'established')),
    workflow_status TEXT,
    safe_error_category TEXT,
    requested_by TEXT NOT NULL,
    source_workflow_instance_id TEXT NOT NULL UNIQUE,
    target_workflow_instance_id TEXT NOT NULL UNIQUE,
    source_delivery_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    established_at TEXT,
    FOREIGN KEY (run_id) REFERENCES orchestration_runs(run_id)
);

INSERT INTO workflow_runtime_recoveries_next
SELECT * FROM workflow_runtime_recoveries;

DROP TABLE workflow_runtime_recoveries;
ALTER TABLE workflow_runtime_recoveries_next RENAME TO workflow_runtime_recoveries;

CREATE INDEX workflow_runtime_recoveries_run_created
ON workflow_runtime_recoveries (run_id, created_at);
