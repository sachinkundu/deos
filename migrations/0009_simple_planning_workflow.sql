ALTER TABLE orchestration_runs
ADD COLUMN selection_kind TEXT
CHECK (selection_kind IN ('default', 'linear_label'));

ALTER TABLE orchestration_runs
ADD COLUMN selection_value TEXT;

ALTER TABLE orchestration_runs
ADD COLUMN selection_delivery_id TEXT;

ALTER TABLE orchestration_runs
ADD COLUMN selection_observed_at TEXT;

ALTER TABLE orchestration_runs
ADD COLUMN selection_provider_digest TEXT;

ALTER TABLE agent_attempts
ADD COLUMN prompt_r2_key TEXT;

ALTER TABLE agent_attempts
ADD COLUMN prompt_sha256 TEXT;

CREATE UNIQUE INDEX agent_attempts_prompt_object
ON agent_attempts (prompt_r2_key)
WHERE prompt_r2_key IS NOT NULL;

CREATE TABLE workflow_definition_selectors (
    project_id TEXT NOT NULL,
    repository TEXT NOT NULL,
    label_name TEXT NOT NULL,
    definition_id TEXT NOT NULL,
    definition_version INTEGER NOT NULL,
    definition_digest TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (project_id, repository, label_name),
    FOREIGN KEY (definition_id, definition_version)
        REFERENCES workflow_definitions(definition_id, version)
);

CREATE INDEX workflow_definition_selectors_definition
ON workflow_definition_selectors (definition_id, definition_version);

CREATE TABLE run_work_products (
    run_id TEXT PRIMARY KEY,
    repository TEXT NOT NULL,
    base_branch TEXT NOT NULL CHECK (base_branch = 'main'),
    remote_branch TEXT NOT NULL UNIQUE,
    change_id TEXT NOT NULL,
    pull_request_database_id TEXT,
    pull_request_number INTEGER CHECK (pull_request_number > 0),
    pull_request_url TEXT,
    head_sha TEXT,
    planning_manifest_digest TEXT,
    planning_manifest_json TEXT,
    latest_publication_operation_id TEXT,
    merge_operation_id TEXT,
    merge_commit_sha TEXT,
    verification_operation_id TEXT,
    verified_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (run_id) REFERENCES orchestration_runs(run_id),
    FOREIGN KEY (latest_publication_operation_id) REFERENCES provider_operations(operation_id),
    FOREIGN KEY (merge_operation_id) REFERENCES provider_operations(operation_id),
    FOREIGN KEY (verification_operation_id) REFERENCES provider_operations(operation_id),
    CHECK (
        (pull_request_database_id IS NULL AND pull_request_number IS NULL AND pull_request_url IS NULL)
        OR
        (pull_request_database_id IS NOT NULL AND pull_request_number IS NOT NULL AND pull_request_url IS NOT NULL)
    ),
    CHECK (
        (head_sha IS NULL AND planning_manifest_digest IS NULL AND planning_manifest_json IS NULL
            AND latest_publication_operation_id IS NULL)
        OR
        (head_sha IS NOT NULL AND planning_manifest_digest IS NOT NULL AND planning_manifest_json IS NOT NULL
            AND latest_publication_operation_id IS NOT NULL)
    ),
    CHECK (
        (merge_operation_id IS NULL AND merge_commit_sha IS NULL)
        OR
        (merge_operation_id IS NOT NULL AND merge_commit_sha IS NOT NULL)
    ),
    CHECK (
        (verification_operation_id IS NULL AND verified_at IS NULL)
        OR
        (verification_operation_id IS NOT NULL AND verified_at IS NOT NULL)
    )
);

CREATE UNIQUE INDEX run_work_products_pull_request
ON run_work_products (repository, pull_request_number)
WHERE pull_request_number IS NOT NULL;
