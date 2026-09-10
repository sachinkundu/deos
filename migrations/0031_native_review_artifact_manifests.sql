-- Native review cycles retain separate manifests under one author attempt.
PRAGMA defer_foreign_keys = ON;

CREATE TABLE artifact_manifests_next (
    manifest_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    attempt_id TEXT NOT NULL,
    r2_key TEXT NOT NULL UNIQUE,
    state TEXT NOT NULL CHECK (state IN ('pending', 'complete', 'failed')),
    aggregate_digest TEXT,
    object_count INTEGER NOT NULL DEFAULT 0,
    total_bytes INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    completed_at TEXT,
    FOREIGN KEY (run_id) REFERENCES orchestration_runs(run_id)
);

INSERT INTO artifact_manifests_next SELECT * FROM artifact_manifests;
DROP TABLE artifact_manifests;
ALTER TABLE artifact_manifests_next RENAME TO artifact_manifests;
CREATE INDEX artifact_manifests_attempt ON artifact_manifests (attempt_id);

PRAGMA defer_foreign_keys = OFF;
