-- Native children belong to one existing author attempt, not agent_attempts.
CREATE TABLE self_review_sessions (
    session_key TEXT PRIMARY KEY,
    author_attempt_id TEXT NOT NULL REFERENCES agent_attempts(attempt_id),
    candidate_sequence INTEGER NOT NULL CHECK (candidate_sequence > 0),
    call_index INTEGER NOT NULL CHECK (call_index >= 0),
    phase TEXT NOT NULL CHECK (phase IN ('planning', 'design')),
    input_sha256 TEXT NOT NULL,
    profile_sha256 TEXT NOT NULL,
    candidate_sha256 TEXT NOT NULL,
    review_id TEXT,
    stop_result TEXT,
    launch_json TEXT NOT NULL CHECK (json_valid(launch_json)),
    subagent_id TEXT,
    state TEXT NOT NULL CHECK (state IN ('allocated', 'started', 'complete', 'accepted', 'fault')),
    proof_r2_key TEXT,
    proof_sha256 TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (author_attempt_id, candidate_sequence, call_index)
);
CREATE TABLE self_review_checkpoints (
    author_attempt_id TEXT NOT NULL REFERENCES agent_attempts(attempt_id),
    sequence INTEGER NOT NULL CHECK (sequence >= 0),
    request_sha256 TEXT NOT NULL,
    request_json TEXT NOT NULL CHECK (json_valid(request_json)),
    response_json TEXT CHECK (response_json IS NULL OR json_valid(response_json)),
    created_at TEXT NOT NULL,
    PRIMARY KEY (author_attempt_id, sequence)
);
