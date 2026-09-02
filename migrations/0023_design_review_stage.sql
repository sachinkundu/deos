ALTER TABLE run_work_products ADD COLUMN verified_merge_commit_sha TEXT;
ALTER TABLE run_work_products ADD COLUMN verification_manifest_digest TEXT;
ALTER TABLE run_work_products ADD COLUMN verification_manifest_json TEXT
CHECK (verification_manifest_json IS NULL OR json_valid(verification_manifest_json));

CREATE TABLE design_work_products (
    run_id TEXT PRIMARY KEY,
    repository TEXT NOT NULL,
    base_branch TEXT NOT NULL CHECK (base_branch = 'main'),
    base_commit TEXT NOT NULL CHECK (length(base_commit) = 40),
    remote_branch TEXT NOT NULL UNIQUE,
    change_id TEXT NOT NULL,
    pull_request_database_id TEXT,
    pull_request_number INTEGER CHECK (pull_request_number > 0),
    pull_request_url TEXT,
    head_sha TEXT,
    design_manifest_digest TEXT,
    design_manifest_json TEXT CHECK (design_manifest_json IS NULL OR json_valid(design_manifest_json)),
    publication_operation_id TEXT,
    merge_operation_id TEXT,
    merge_commit_sha TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (run_id) REFERENCES orchestration_runs(run_id),
    FOREIGN KEY (publication_operation_id) REFERENCES provider_operations(operation_id),
    FOREIGN KEY (merge_operation_id) REFERENCES provider_operations(operation_id),
    CHECK (
        (pull_request_database_id IS NULL AND pull_request_number IS NULL AND pull_request_url IS NULL)
        OR
        (pull_request_database_id IS NOT NULL AND pull_request_number IS NOT NULL AND pull_request_url IS NOT NULL)
    ),
    CHECK (
        (head_sha IS NULL AND design_manifest_digest IS NULL AND design_manifest_json IS NULL
            AND publication_operation_id IS NULL)
        OR
        (head_sha IS NOT NULL AND design_manifest_digest IS NOT NULL AND design_manifest_json IS NOT NULL
            AND publication_operation_id IS NOT NULL)
    ),
    CHECK (
        (merge_operation_id IS NULL AND merge_commit_sha IS NULL)
        OR
        (merge_operation_id IS NOT NULL AND merge_commit_sha IS NOT NULL)
    )
);

CREATE UNIQUE INDEX design_work_products_pull_request
ON design_work_products (repository, pull_request_number)
WHERE pull_request_number IS NOT NULL;

CREATE TABLE design_candidates (
    candidate_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    round INTEGER NOT NULL CHECK (round > 0),
    source_attempt_id TEXT NOT NULL,
    base_commit TEXT NOT NULL CHECK (length(base_commit) = 40),
    change_id TEXT NOT NULL,
    design_digest TEXT NOT NULL CHECK (length(design_digest) = 64),
    candidate_digest TEXT NOT NULL CHECK (length(candidate_digest) = 64),
    candidate_r2_key TEXT NOT NULL UNIQUE,
    candidate_sha256 TEXT NOT NULL CHECK (length(candidate_sha256) = 64),
    validation_r2_key TEXT NOT NULL UNIQUE,
    validation_sha256 TEXT NOT NULL CHECK (length(validation_sha256) = 64),
    state TEXT NOT NULL CHECK (state IN ('validated', 'rejected')),
    created_at TEXT NOT NULL,
    accepted_at TEXT,
    FOREIGN KEY (run_id) REFERENCES orchestration_runs(run_id),
    FOREIGN KEY (source_attempt_id) REFERENCES agent_attempts(attempt_id),
    UNIQUE (run_id, round, candidate_digest)
);

CREATE INDEX design_candidates_run_round
ON design_candidates (run_id, round, created_at);

CREATE TABLE human_gate_visits (
    run_id TEXT NOT NULL,
    visit_sequence INTEGER NOT NULL CHECK (visit_sequence > 0),
    node_id TEXT NOT NULL,
    gate_kind TEXT NOT NULL CHECK (gate_kind IN ('plan', 'design')),
    work_type TEXT NOT NULL CHECK (work_type IN ('proposal_and_specs', 'design')),
    work_product_kind TEXT NOT NULL CHECK (work_product_kind IN ('planning', 'design')),
    round INTEGER NOT NULL CHECK (round > 0),
    state TEXT NOT NULL CHECK (state IN ('open', 'revision_requested', 'merge_authorized', 'canceled')),
    repository TEXT NOT NULL,
    pull_request_database_id TEXT NOT NULL,
    pull_request_number INTEGER NOT NULL CHECK (pull_request_number > 0),
    pull_request_url TEXT NOT NULL,
    head_branch TEXT NOT NULL,
    base_branch TEXT NOT NULL CHECK (base_branch = 'main'),
    approved_head_sha TEXT NOT NULL CHECK (length(approved_head_sha) = 40),
    decision_delivery_id TEXT UNIQUE,
    decision_outcome TEXT CHECK (decision_outcome IN ('revision_requested', 'merge_authorized', 'canceled')),
    created_at TEXT NOT NULL,
    decided_at TEXT,
    PRIMARY KEY (run_id, visit_sequence),
    FOREIGN KEY (run_id) REFERENCES orchestration_runs(run_id),
    FOREIGN KEY (decision_delivery_id) REFERENCES workflow_event_inbox(delivery_id),
    CHECK (
        (decision_delivery_id IS NULL AND decision_outcome IS NULL AND decided_at IS NULL AND state = 'open')
        OR
        (decision_delivery_id IS NOT NULL AND decision_outcome IS NOT NULL AND decided_at IS NOT NULL
            AND state = decision_outcome)
    ),
    CHECK (
        (gate_kind = 'plan' AND work_type = 'proposal_and_specs' AND work_product_kind = 'planning')
        OR
        (gate_kind = 'design' AND work_type = 'design' AND work_product_kind = 'design')
    )
);

CREATE INDEX human_gate_visits_run_kind
ON human_gate_visits (run_id, gate_kind, visit_sequence);

CREATE TABLE agent_stage_retries_design_next (
    retry_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    failed_attempt_id TEXT NOT NULL UNIQUE,
    retry_node TEXT NOT NULL CHECK (
        retry_node IN (
            'planning_revision_author', 'independent_discovery', 'independent_recheck',
            'design_author', 'design_revision_author'
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
    FOREIGN KEY (run_id) REFERENCES orchestration_runs(run_id),
    FOREIGN KEY (failed_attempt_id) REFERENCES agent_attempts(attempt_id)
);

INSERT INTO agent_stage_retries_design_next
SELECT * FROM agent_stage_retries;

DROP TABLE agent_stage_retries;
ALTER TABLE agent_stage_retries_design_next RENAME TO agent_stage_retries;

CREATE INDEX agent_stage_retries_run_created
ON agent_stage_retries (run_id, created_at);

CREATE UNIQUE INDEX agent_stage_retries_target_workflow_instance
ON agent_stage_retries (target_workflow_instance_id)
WHERE target_workflow_instance_id IS NOT NULL AND retry_kind = 'compatible_tail';
