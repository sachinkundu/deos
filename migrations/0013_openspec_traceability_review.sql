ALTER TABLE project_workflow_policies
ADD COLUMN independent_review_provider TEXT NOT NULL DEFAULT 'openrouter'
CHECK (independent_review_provider = 'openrouter');

ALTER TABLE project_workflow_policies
ADD COLUMN independent_review_model TEXT;

ALTER TABLE project_workflow_policies
ADD COLUMN independent_review_revision INTEGER NOT NULL DEFAULT 1;

ALTER TABLE project_workflow_policies
ADD COLUMN independent_review_updated_by TEXT NOT NULL DEFAULT 'deployment';

ALTER TABLE project_workflow_policies
ADD COLUMN independent_review_updated_at TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z';

ALTER TABLE orchestration_runs ADD COLUMN author_model_provider TEXT;
ALTER TABLE orchestration_runs ADD COLUMN author_model TEXT;
ALTER TABLE orchestration_runs ADD COLUMN author_reasoning TEXT;
ALTER TABLE orchestration_runs ADD COLUMN independent_review_provider TEXT;
ALTER TABLE orchestration_runs ADD COLUMN independent_review_model TEXT;
ALTER TABLE orchestration_runs ADD COLUMN independent_review_reasoning TEXT;

CREATE TABLE planning_candidates (
    candidate_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    round INTEGER NOT NULL CHECK (round > 0),
    source_attempt_id TEXT NOT NULL,
    base_commit TEXT NOT NULL,
    change_id TEXT NOT NULL,
    candidate_digest TEXT NOT NULL,
    review_set_digest TEXT NOT NULL,
    file_list_json TEXT NOT NULL CHECK (json_valid(file_list_json)),
    candidate_r2_key TEXT NOT NULL UNIQUE,
    candidate_sha256 TEXT NOT NULL,
    validation_r2_key TEXT NOT NULL UNIQUE,
    validation_sha256 TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('validated', 'rejected')),
    created_at TEXT NOT NULL,
    accepted_at TEXT,
    FOREIGN KEY (run_id) REFERENCES orchestration_runs(run_id),
    FOREIGN KEY (source_attempt_id) REFERENCES agent_attempts(attempt_id),
    UNIQUE (run_id, round, candidate_digest)
);

CREATE INDEX planning_candidates_run_round
ON planning_candidates (run_id, round, created_at);

CREATE TABLE trace_review_phases (
    run_id TEXT NOT NULL,
    round INTEGER NOT NULL CHECK (round > 0),
    stage TEXT NOT NULL CHECK (stage IN ('self_check', 'independent')),
    state TEXT NOT NULL CHECK (state IN (
        'awaiting_discovery', 'findings_open', 'awaiting_repair',
        'awaiting_recheck', 'proof_conflict', 'closed_pass',
        'closed_needs_judgment', 'stopped'
    )),
    current_candidate_id TEXT NOT NULL,
    current_head_sha TEXT,
    current_review_input_id TEXT,
    base_finding_set_digest TEXT,
    accepted_review_id TEXT,
    shared_repair_turns INTEGER NOT NULL DEFAULT 0 CHECK (shared_repair_turns BETWEEN 0 AND 3),
    review_job_count INTEGER NOT NULL DEFAULT 0 CHECK (review_job_count >= 0),
    proof_repair_count INTEGER NOT NULL DEFAULT 0 CHECK (proof_repair_count >= 0),
    revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (run_id, round, stage),
    FOREIGN KEY (run_id) REFERENCES orchestration_runs(run_id),
    FOREIGN KEY (current_candidate_id) REFERENCES planning_candidates(candidate_id)
);

CREATE TABLE trace_reviews (
    review_id TEXT PRIMARY KEY,
    review_input_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    attempt_id TEXT,
    phase TEXT NOT NULL CHECK (phase IN ('self_check', 'independent')),
    mode TEXT NOT NULL CHECK (mode IN ('discovery', 'recheck')),
    round INTEGER NOT NULL CHECK (round > 0),
    candidate_id TEXT NOT NULL,
    reviewed_head_sha TEXT,
    author_model_provider TEXT NOT NULL,
    author_model TEXT NOT NULL,
    reviewer_provider TEXT NOT NULL,
    reviewer_model TEXT NOT NULL,
    reasoning_effort TEXT NOT NULL,
    prompt_version TEXT NOT NULL,
    prompt_sha256 TEXT NOT NULL,
    tool_version TEXT NOT NULL,
    bundle_sha256 TEXT NOT NULL,
    baseline_finding_set_digest TEXT,
    proof_manifest_id TEXT NOT NULL,
    sidecar_r2_key TEXT NOT NULL,
    overall_outcome TEXT NOT NULL CHECK (overall_outcome IN (
        'pass', 'findings', 'needs_judgment', 'proof_conflict', 'failed', 'blocked'
    )),
    accepted INTEGER NOT NULL DEFAULT 0 CHECK (accepted IN (0, 1)),
    reused_from_review_id TEXT,
    conflicting_review_id TEXT,
    created_at TEXT NOT NULL,
    completed_at TEXT,
    FOREIGN KEY (run_id) REFERENCES orchestration_runs(run_id),
    FOREIGN KEY (attempt_id) REFERENCES agent_attempts(attempt_id),
    FOREIGN KEY (candidate_id) REFERENCES planning_candidates(candidate_id),
    FOREIGN KEY (proof_manifest_id) REFERENCES artifact_manifests(manifest_id),
    FOREIGN KEY (reused_from_review_id) REFERENCES trace_reviews(review_id),
    FOREIGN KEY (conflicting_review_id) REFERENCES trace_reviews(review_id)
);

CREATE UNIQUE INDEX trace_reviews_one_accepted_input
ON trace_reviews (review_input_id)
WHERE accepted = 1;

CREATE INDEX trace_reviews_run_round
ON trace_reviews (run_id, round, phase, created_at);

CREATE TABLE trace_review_head_bindings (
    binding_id TEXT PRIMARY KEY,
    review_id TEXT NOT NULL,
    repository TEXT NOT NULL,
    pull_request_number INTEGER NOT NULL CHECK (pull_request_number > 0),
    head_sha TEXT NOT NULL,
    reviewed_files_digest TEXT NOT NULL,
    comparison_receipt_r2_key TEXT NOT NULL UNIQUE,
    comparison_receipt_sha256 TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (review_id) REFERENCES trace_reviews(review_id),
    UNIQUE (review_id, head_sha)
);

CREATE INDEX trace_review_head_bindings_target
ON trace_review_head_bindings (repository, pull_request_number, head_sha);
