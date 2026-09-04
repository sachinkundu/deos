CREATE TABLE design_review_rounds (
    round_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    round_no INTEGER NOT NULL CHECK (round_no > 0),
    kind TEXT NOT NULL CHECK (kind IN ('initial', 'human_revision')),
    self_required INTEGER NOT NULL CHECK (self_required IN (0, 1)),
    author_provider TEXT NOT NULL CHECK (author_provider = 'codex'),
    author_model TEXT NOT NULL,
    author_reasoning TEXT NOT NULL,
    outside_provider TEXT NOT NULL CHECK (outside_provider = 'openrouter'),
    outside_model TEXT NOT NULL,
    outside_reasoning TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN (
        'active', 'ready_for_human', 'human_revision', 'merged', 'failed'
    )),
    response_turns INTEGER NOT NULL DEFAULT 0 CHECK (response_turns BETWEEN 0 AND 3),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (run_id) REFERENCES orchestration_runs(run_id),
    UNIQUE (run_id, round_no),
    CHECK (
        (kind = 'initial' AND round_no = 1 AND self_required = 1)
        OR (kind = 'human_revision' AND round_no > 1 AND self_required = 0)
    )
);

CREATE INDEX design_review_rounds_run_status
ON design_review_rounds (run_id, status, round_no);

CREATE TABLE design_review_attempts (
    review_attempt_id TEXT PRIMARY KEY,
    round_id TEXT NOT NULL,
    agent_attempt_id TEXT,
    phase TEXT NOT NULL CHECK (phase IN ('self', 'independent')),
    input_sha256 TEXT NOT NULL CHECK (length(input_sha256) = 64),
    input_r2_key TEXT NOT NULL,
    input_object_sha256 TEXT NOT NULL CHECK (length(input_object_sha256) = 64),
    candidate_id TEXT NOT NULL,
    pr_database_id TEXT,
    head_sha TEXT CHECK (head_sha IS NULL OR length(head_sha) = 40),
    model_provider TEXT NOT NULL CHECK (model_provider IN ('codex', 'openrouter')),
    model TEXT NOT NULL,
    reasoning TEXT NOT NULL,
    outcome TEXT NOT NULL CHECK (outcome IN ('pass', 'concerns', 'invalid', 'failed')),
    evidence_manifest_id TEXT,
    evidence_r2_key TEXT,
    evidence_sha256 TEXT CHECK (evidence_sha256 IS NULL OR length(evidence_sha256) = 64),
    accepted INTEGER NOT NULL DEFAULT 0 CHECK (accepted IN (0, 1)),
    created_at TEXT NOT NULL,
    completed_at TEXT,
    FOREIGN KEY (round_id) REFERENCES design_review_rounds(round_id),
    FOREIGN KEY (agent_attempt_id) REFERENCES agent_attempts(attempt_id),
    FOREIGN KEY (candidate_id) REFERENCES design_candidates(candidate_id),
    FOREIGN KEY (evidence_manifest_id) REFERENCES artifact_manifests(manifest_id),
    CHECK (
        (phase = 'self' AND pr_database_id IS NULL AND head_sha IS NULL AND model_provider = 'codex')
        OR (phase = 'independent' AND pr_database_id IS NOT NULL AND head_sha IS NOT NULL
            AND model_provider = 'openrouter')
    ),
    CHECK (
        (accepted = 0)
        OR (outcome IN ('pass', 'concerns') AND evidence_manifest_id IS NOT NULL
            AND evidence_r2_key IS NOT NULL AND evidence_sha256 IS NOT NULL
            AND completed_at IS NOT NULL)
    )
);

CREATE UNIQUE INDEX design_review_attempts_one_accepted_input
ON design_review_attempts (input_sha256)
WHERE accepted = 1;

CREATE INDEX design_review_attempts_round_phase
ON design_review_attempts (round_id, phase, created_at);

CREATE TABLE design_review_findings (
    review_attempt_id TEXT NOT NULL,
    finding_id TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
    category TEXT NOT NULL CHECK (category IN (
        'correctness', 'completeness', 'consistency', 'security', 'operability'
    )),
    message TEXT NOT NULL CHECK (length(message) BETWEEN 1 AND 4000),
    source_ranges_json TEXT NOT NULL CHECK (json_valid(source_ranges_json)),
    created_at TEXT NOT NULL,
    PRIMARY KEY (review_attempt_id, finding_id),
    FOREIGN KEY (review_attempt_id) REFERENCES design_review_attempts(review_attempt_id)
);

CREATE TABLE design_review_dispositions (
    review_attempt_id TEXT NOT NULL,
    finding_id TEXT NOT NULL,
    author_attempt_id TEXT NOT NULL,
    disposition TEXT NOT NULL CHECK (disposition IN ('applied', 'declined', 'no_change')),
    reason TEXT NOT NULL CHECK (length(reason) BETWEEN 1 AND 4000),
    resulting_candidate_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (review_attempt_id, finding_id),
    FOREIGN KEY (review_attempt_id, finding_id)
        REFERENCES design_review_findings(review_attempt_id, finding_id),
    FOREIGN KEY (author_attempt_id) REFERENCES agent_attempts(attempt_id),
    FOREIGN KEY (resulting_candidate_id) REFERENCES design_candidates(candidate_id)
);

CREATE TABLE design_gate_bindings (
    run_id TEXT NOT NULL,
    visit_sequence INTEGER NOT NULL CHECK (visit_sequence > 0),
    round_id TEXT NOT NULL,
    pr_database_id TEXT NOT NULL,
    head_sha TEXT NOT NULL CHECK (length(head_sha) = 40),
    self_review_attempt_id TEXT,
    independent_review_attempt_id TEXT NOT NULL,
    independent_input_sha256 TEXT NOT NULL CHECK (length(independent_input_sha256) = 64),
    created_at TEXT NOT NULL,
    PRIMARY KEY (run_id, visit_sequence),
    FOREIGN KEY (run_id, visit_sequence) REFERENCES human_gate_visits(run_id, visit_sequence),
    FOREIGN KEY (round_id) REFERENCES design_review_rounds(round_id),
    FOREIGN KEY (self_review_attempt_id) REFERENCES design_review_attempts(review_attempt_id),
    FOREIGN KEY (independent_review_attempt_id) REFERENCES design_review_attempts(review_attempt_id)
);

CREATE INDEX design_gate_bindings_exact_head
ON design_gate_bindings (run_id, pr_database_id, head_sha);

CREATE TABLE agent_stage_retries_design_review_next (
    retry_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    failed_attempt_id TEXT NOT NULL UNIQUE,
    retry_node TEXT NOT NULL CHECK (
        retry_node IN (
            'planning_revision_author', 'independent_discovery', 'independent_recheck',
            'design_author', 'design_revision_author', 'design_self_review',
            'design_independent_review', 'design_self_response',
            'design_independent_response'
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

INSERT INTO agent_stage_retries_design_review_next
SELECT * FROM agent_stage_retries;

DROP TABLE agent_stage_retries;
ALTER TABLE agent_stage_retries_design_review_next RENAME TO agent_stage_retries;

CREATE INDEX agent_stage_retries_run_created
ON agent_stage_retries (run_id, created_at);

CREATE UNIQUE INDEX agent_stage_retries_target_workflow_instance
ON agent_stage_retries (target_workflow_instance_id)
WHERE target_workflow_instance_id IS NOT NULL AND retry_kind = 'compatible_tail';
