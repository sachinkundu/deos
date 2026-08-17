CREATE TABLE IF NOT EXISTS workflow_definitions (
    definition_id TEXT NOT NULL,
    version INTEGER NOT NULL CHECK (version > 0),
    project_id TEXT NOT NULL,
    name TEXT NOT NULL,
    canonical_json TEXT NOT NULL,
    digest TEXT NOT NULL,
    enabled_at TEXT,
    created_at TEXT NOT NULL,
    PRIMARY KEY (definition_id, version),
    UNIQUE (digest)
);

CREATE TABLE IF NOT EXISTS project_workflow_policies (
    project_id TEXT PRIMARY KEY,
    definition_id TEXT NOT NULL,
    definition_version INTEGER NOT NULL,
    definition_digest TEXT NOT NULL,
    trial_repository TEXT NOT NULL,
    start_state_name TEXT NOT NULL,
    human_gate_state_id TEXT NOT NULL,
    dispatch_enabled INTEGER NOT NULL DEFAULT 0 CHECK (dispatch_enabled IN (0, 1)),
    updated_at TEXT NOT NULL,
    FOREIGN KEY (definition_id, definition_version)
        REFERENCES workflow_definitions(definition_id, version)
);

CREATE TABLE IF NOT EXISTS orchestration_runs (
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
        status IN ('pending_dispatch', 'active', 'awaiting_human', 'blocked', 'succeeded', 'failed', 'canceled')
    ),
    accumulated_data_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    terminal_at TEXT,
    UNIQUE (project_id, issue_id, run_sequence),
    FOREIGN KEY (definition_id, definition_version)
        REFERENCES workflow_definitions(definition_id, version)
);

CREATE UNIQUE INDEX IF NOT EXISTS orchestration_runs_one_active_issue
ON orchestration_runs (project_id, issue_id)
WHERE status IN ('pending_dispatch', 'active', 'awaiting_human');

CREATE INDEX IF NOT EXISTS orchestration_runs_correlation
ON orchestration_runs (correlation_id, run_sequence);

CREATE TABLE IF NOT EXISTS dispatch_intents (
    run_id TEXT PRIMARY KEY,
    source_delivery_id TEXT NOT NULL UNIQUE,
    workflow_instance_id TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('pending', 'established', 'failed')),
    attempt_count INTEGER NOT NULL DEFAULT 0,
    last_attempt_at TEXT,
    safe_error_category TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (run_id) REFERENCES orchestration_runs(run_id)
);

CREATE TABLE IF NOT EXISTS workflow_event_inbox (
    delivery_id TEXT PRIMARY KEY,
    run_id TEXT,
    correlation_id TEXT NOT NULL,
    event_kind TEXT NOT NULL,
    actor_id TEXT,
    actor_type TEXT,
    provider_time TEXT NOT NULL,
    from_state_id TEXT,
    from_state_name TEXT,
    to_state_id TEXT,
    to_state_name TEXT NOT NULL,
    payload_digest TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('pending', 'sent', 'claimed', 'processed', 'duplicate', 'unmatched')),
    sent_at TEXT,
    claimed_at TEXT,
    processed_at TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (run_id) REFERENCES orchestration_runs(run_id)
);

CREATE INDEX IF NOT EXISTS workflow_event_inbox_run_state
ON workflow_event_inbox (run_id, state, provider_time);

CREATE TABLE IF NOT EXISTS provider_operations (
    operation_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    attempt_id TEXT,
    capability TEXT NOT NULL,
    action TEXT NOT NULL,
    sanitized_target TEXT NOT NULL,
    request_digest TEXT NOT NULL,
    state TEXT NOT NULL CHECK (
        state IN ('pending', 'succeeded', 'denied', 'failed', 'duplicate', 'reconciled', 'manual_reconciliation_required')
    ),
    provider_resource_id TEXT,
    observed_pre_state TEXT,
    provider_updated_at TEXT,
    latest_delivery_id TEXT,
    safe_error_category TEXT,
    diagnostic_id TEXT,
    started_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT,
    FOREIGN KEY (run_id) REFERENCES orchestration_runs(run_id)
);

CREATE INDEX IF NOT EXISTS provider_operations_attempt
ON provider_operations (attempt_id, state);

CREATE TABLE IF NOT EXISTS workflow_transitions_v2 (
    transition_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    from_node TEXT NOT NULL,
    to_node TEXT NOT NULL,
    cause_type TEXT NOT NULL,
    cause_reference TEXT NOT NULL,
    actor_id TEXT,
    actor_type TEXT,
    provider_operation_id TEXT,
    occurred_at TEXT NOT NULL,
    FOREIGN KEY (run_id) REFERENCES orchestration_runs(run_id),
    FOREIGN KEY (provider_operation_id) REFERENCES provider_operations(operation_id)
);

CREATE INDEX IF NOT EXISTS workflow_transitions_v2_run_time
ON workflow_transitions_v2 (run_id, occurred_at);

CREATE TABLE IF NOT EXISTS artifact_manifests (
    manifest_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    attempt_id TEXT NOT NULL UNIQUE,
    r2_key TEXT NOT NULL UNIQUE,
    state TEXT NOT NULL CHECK (state IN ('pending', 'complete', 'failed')),
    aggregate_digest TEXT,
    object_count INTEGER NOT NULL DEFAULT 0,
    total_bytes INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    completed_at TEXT,
    FOREIGN KEY (run_id) REFERENCES orchestration_runs(run_id)
);

CREATE TABLE IF NOT EXISTS agent_attempts (
    attempt_id TEXT PRIMARY KEY,
    sandbox_id TEXT NOT NULL UNIQUE,
    run_id TEXT NOT NULL,
    node_id TEXT NOT NULL,
    job_spec_json TEXT NOT NULL,
    job_spec_digest TEXT NOT NULL,
    process_id TEXT,
    process_runtime_id TEXT,
    state TEXT NOT NULL CHECK (
        state IN ('pending', 'starting', 'running', 'collecting', 'completed', 'blocked', 'failed', 'interrupted', 'absolute_timeout', 'canceled')
    ),
    started_at TEXT,
    heartbeat_at TEXT,
    absolute_deadline TEXT NOT NULL,
    ended_at TEXT,
    result_class TEXT,
    manifest_id TEXT,
    cleanup_state TEXT NOT NULL DEFAULT 'pending' CHECK (cleanup_state IN ('pending', 'destroyed', 'failed')),
    cleanup_error_category TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (run_id) REFERENCES orchestration_runs(run_id),
    FOREIGN KEY (manifest_id) REFERENCES artifact_manifests(manifest_id)
);

CREATE INDEX IF NOT EXISTS agent_attempts_live
ON agent_attempts (state, heartbeat_at);

CREATE TABLE IF NOT EXISTS credential_leases (
    profile_id TEXT PRIMARY KEY,
    attempt_id TEXT NOT NULL UNIQUE,
    encrypted_object_key TEXT NOT NULL,
    object_version TEXT,
    object_etag TEXT,
    lease_expires_at TEXT NOT NULL,
    refresh_outcome TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (attempt_id) REFERENCES agent_attempts(attempt_id)
);

CREATE TABLE IF NOT EXISTS artifacts (
    manifest_id TEXT NOT NULL,
    logical_name TEXT NOT NULL,
    r2_key TEXT NOT NULL UNIQUE,
    media_type TEXT NOT NULL,
    byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
    sha256 TEXT NOT NULL,
    created_at TEXT NOT NULL,
    policy_outcome TEXT NOT NULL,
    PRIMARY KEY (manifest_id, logical_name),
    FOREIGN KEY (manifest_id) REFERENCES artifact_manifests(manifest_id)
);

CREATE TABLE IF NOT EXISTS diagnostics (
    diagnostic_id TEXT PRIMARY KEY,
    run_id TEXT,
    attempt_id TEXT,
    stage TEXT NOT NULL,
    encrypted_r2_key TEXT NOT NULL UNIQUE,
    safe_category TEXT NOT NULL,
    access_policy_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (run_id) REFERENCES orchestration_runs(run_id),
    FOREIGN KEY (attempt_id) REFERENCES agent_attempts(attempt_id)
);

CREATE TABLE IF NOT EXISTS cleanup_work_items (
    sandbox_id TEXT PRIMARY KEY,
    run_id TEXT,
    attempt_id TEXT,
    linear_operation_id TEXT NOT NULL UNIQUE,
    linear_resource_id TEXT,
    cleanup_state TEXT NOT NULL CHECK (cleanup_state IN ('pending', 'reported', 'destroyed', 'failed')),
    last_attempt_at TEXT,
    safe_error_category TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (run_id) REFERENCES orchestration_runs(run_id),
    FOREIGN KEY (attempt_id) REFERENCES agent_attempts(attempt_id)
);
