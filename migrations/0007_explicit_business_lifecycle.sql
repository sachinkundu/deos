PRAGMA defer_foreign_keys = ON;

CREATE TABLE orchestration_runs_v4 (
    run_id TEXT PRIMARY KEY,
    correlation_id TEXT NOT NULL,
    run_sequence INTEGER NOT NULL CHECK (run_sequence > 0),
    project_id TEXT NOT NULL,
    issue_id TEXT NOT NULL,
    definition_id TEXT NOT NULL,
    definition_version INTEGER NOT NULL,
    definition_digest TEXT NOT NULL,
    workflow_instance_id TEXT NOT NULL UNIQUE,
    previous_node TEXT,
    current_node TEXT NOT NULL,
    gate_origin_node TEXT,
    status TEXT NOT NULL CHECK (
        status IN (
            'pending_dispatch', 'active', 'awaiting_human',
            'awaiting_capability', 'manual_reconciliation_required',
            'blocked', 'succeeded', 'denied', 'failed', 'canceled'
        )
    ),
    accumulated_data_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    terminal_at TEXT,
    terminal_cause TEXT,
    UNIQUE (project_id, issue_id, run_sequence),
    FOREIGN KEY (definition_id, definition_version)
        REFERENCES workflow_definitions(definition_id, version)
);

INSERT INTO orchestration_runs_v4 (
    run_id, correlation_id, run_sequence, project_id, issue_id, definition_id,
    definition_version, definition_digest, workflow_instance_id, previous_node,
    current_node, gate_origin_node, status, accumulated_data_json, created_at,
    updated_at, terminal_at
)
SELECT
    run_id, correlation_id, run_sequence, project_id, issue_id, definition_id,
    definition_version, definition_digest, workflow_instance_id, previous_node,
    current_node, gate_origin_node, status, accumulated_data_json, created_at,
    updated_at, terminal_at
FROM orchestration_runs;

DROP TABLE orchestration_runs;
ALTER TABLE orchestration_runs_v4 RENAME TO orchestration_runs;

CREATE UNIQUE INDEX orchestration_runs_one_active_issue
ON orchestration_runs (project_id, issue_id)
WHERE status IN (
    'pending_dispatch', 'active', 'awaiting_human',
    'awaiting_capability', 'manual_reconciliation_required'
);

CREATE INDEX orchestration_runs_correlation
ON orchestration_runs (correlation_id, run_sequence);

CREATE TABLE workflow_waits (
    wait_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    node_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('awaiting', 'consumed', 'canceled')),
    resume_event_type TEXT NOT NULL,
    resume_event_json TEXT NOT NULL,
    resume_event_digest TEXT NOT NULL,
    cancel_event_type TEXT NOT NULL,
    cancel_event_json TEXT NOT NULL,
    cancel_event_digest TEXT NOT NULL,
    cause_reference TEXT NOT NULL,
    created_at TEXT NOT NULL,
    consumed_delivery_id TEXT UNIQUE,
    consumed_at TEXT,
    FOREIGN KEY (run_id) REFERENCES orchestration_runs(run_id),
    FOREIGN KEY (consumed_delivery_id) REFERENCES workflow_event_inbox(delivery_id),
    UNIQUE (run_id, node_id, wait_id)
);

CREATE UNIQUE INDEX workflow_waits_one_open_node
ON workflow_waits (run_id, node_id)
WHERE status = 'awaiting';

CREATE INDEX workflow_waits_run_history
ON workflow_waits (run_id, created_at, wait_id);

CREATE TABLE workflow_wait_deliveries (
    delivery_id TEXT PRIMARY KEY,
    wait_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    decision TEXT NOT NULL CHECK (
        decision IN ('resumed', 'canceled', 'rejected', 'already_consumed')
    ),
    safe_reason TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    FOREIGN KEY (delivery_id) REFERENCES workflow_event_inbox(delivery_id),
    FOREIGN KEY (wait_id) REFERENCES workflow_waits(wait_id),
    FOREIGN KEY (run_id) REFERENCES orchestration_runs(run_id)
);

CREATE INDEX workflow_wait_deliveries_run_time
ON workflow_wait_deliveries (run_id, occurred_at);

CREATE TABLE workflow_completion_reconciliations (
    reconciliation_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    workflow_instance_id TEXT NOT NULL,
    safe_cause TEXT NOT NULL,
    observed_executor_status TEXT NOT NULL,
    observed_run_status TEXT NOT NULL,
    observed_node TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('pending_notice', 'notified', 'conflict')),
    linear_operation_key TEXT NOT NULL UNIQUE,
    linear_resource_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (run_id) REFERENCES orchestration_runs(run_id),
    UNIQUE (run_id, safe_cause)
);

CREATE INDEX workflow_completion_reconciliations_state
ON workflow_completion_reconciliations (state, updated_at);

PRAGMA defer_foreign_keys = OFF;
