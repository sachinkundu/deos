-- A credential checkout belongs to one attempt, not exclusively to one
-- profile. Several Sandboxes may start from the same protected auth snapshot.
-- Refreshed auth is still reconciled with the source R2 ETag.
CREATE TABLE credential_leases_next (
    profile_id TEXT NOT NULL,
    attempt_id TEXT NOT NULL UNIQUE,
    encrypted_object_key TEXT NOT NULL,
    object_version TEXT,
    object_etag TEXT,
    lease_expires_at TEXT NOT NULL,
    refresh_outcome TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (profile_id, attempt_id),
    FOREIGN KEY (attempt_id) REFERENCES agent_attempts(attempt_id)
);

INSERT INTO credential_leases_next (
    profile_id, attempt_id, encrypted_object_key, object_version, object_etag,
    lease_expires_at, refresh_outcome, created_at, updated_at
)
SELECT
    profile_id, attempt_id, encrypted_object_key, object_version, object_etag,
    lease_expires_at, refresh_outcome, created_at, updated_at
FROM credential_leases;

DROP TABLE credential_leases;
ALTER TABLE credential_leases_next RENAME TO credential_leases;

CREATE INDEX credential_leases_profile_expiry
ON credential_leases (profile_id, lease_expires_at);
