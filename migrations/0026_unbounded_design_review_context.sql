CREATE TABLE design_review_rounds_next (
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
    response_turns INTEGER NOT NULL DEFAULT 0 CHECK (response_turns >= 0),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (run_id) REFERENCES orchestration_runs(run_id),
    UNIQUE (run_id, round_no),
    CHECK (
        (kind = 'initial' AND round_no = 1 AND self_required = 1)
        OR (kind = 'human_revision' AND round_no > 1 AND self_required = 0)
    )
);

CREATE TABLE design_review_attempts_next (
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
    FOREIGN KEY (round_id) REFERENCES design_review_rounds_next(round_id),
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

CREATE TABLE design_review_findings_next (
    review_attempt_id TEXT NOT NULL,
    finding_id TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
    category TEXT NOT NULL CHECK (category IN (
        'correctness', 'completeness', 'consistency', 'security', 'operability'
    )),
    message TEXT NOT NULL CHECK (length(message) > 0),
    source_ranges_json TEXT NOT NULL CHECK (json_valid(source_ranges_json)),
    created_at TEXT NOT NULL,
    PRIMARY KEY (review_attempt_id, finding_id),
    FOREIGN KEY (review_attempt_id) REFERENCES design_review_attempts_next(review_attempt_id)
);

CREATE TABLE design_review_dispositions_next (
    review_attempt_id TEXT NOT NULL,
    finding_id TEXT NOT NULL,
    author_attempt_id TEXT NOT NULL,
    disposition TEXT NOT NULL CHECK (disposition IN ('applied', 'declined', 'no_change')),
    reason TEXT NOT NULL CHECK (length(reason) > 0),
    resulting_candidate_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (review_attempt_id, finding_id),
    FOREIGN KEY (review_attempt_id, finding_id)
        REFERENCES design_review_findings_next(review_attempt_id, finding_id),
    FOREIGN KEY (author_attempt_id) REFERENCES agent_attempts(attempt_id),
    FOREIGN KEY (resulting_candidate_id) REFERENCES design_candidates(candidate_id)
);

CREATE TABLE design_gate_bindings_next (
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
    FOREIGN KEY (round_id) REFERENCES design_review_rounds_next(round_id),
    FOREIGN KEY (self_review_attempt_id) REFERENCES design_review_attempts_next(review_attempt_id),
    FOREIGN KEY (independent_review_attempt_id) REFERENCES design_review_attempts_next(review_attempt_id)
);

INSERT INTO design_review_rounds_next SELECT * FROM design_review_rounds;
INSERT INTO design_review_attempts_next SELECT * FROM design_review_attempts;
INSERT INTO design_review_findings_next SELECT * FROM design_review_findings;
INSERT INTO design_review_dispositions_next SELECT * FROM design_review_dispositions;
INSERT INTO design_gate_bindings_next SELECT * FROM design_gate_bindings;

DROP TABLE design_gate_bindings;
DROP TABLE design_review_dispositions;
DROP TABLE design_review_findings;
DROP TABLE design_review_attempts;
DROP TABLE design_review_rounds;

ALTER TABLE design_review_rounds_next RENAME TO design_review_rounds;
ALTER TABLE design_review_attempts_next RENAME TO design_review_attempts;
ALTER TABLE design_review_findings_next RENAME TO design_review_findings;
ALTER TABLE design_review_dispositions_next RENAME TO design_review_dispositions;
ALTER TABLE design_gate_bindings_next RENAME TO design_gate_bindings;

CREATE INDEX design_review_rounds_run_status
ON design_review_rounds (run_id, status, round_no);

CREATE UNIQUE INDEX design_review_attempts_one_accepted_input
ON design_review_attempts (input_sha256)
WHERE accepted = 1;

CREATE INDEX design_review_attempts_round_phase
ON design_review_attempts (round_id, phase, created_at);

CREATE INDEX design_gate_bindings_exact_head
ON design_gate_bindings (run_id, pr_database_id, head_sha);
