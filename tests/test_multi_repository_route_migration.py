import sqlite3
from pathlib import Path


def apply_migrations(database: sqlite3.Connection, *, through: str | None = None) -> None:
    database.execute("PRAGMA foreign_keys = ON")
    for migration in sorted(Path("migrations").glob("*.sql")):
        if through is not None and migration.name > through:
            break
        database.executescript(migration.read_text())


def test_route_storage_is_additive_and_secret_free() -> None:
    database = sqlite3.connect(":memory:")
    apply_migrations(database)

    policy_columns = {
        row[1]
        for row in database.execute("PRAGMA table_info(project_workflow_policies)")
    }
    assert {
        "linear_project_name",
        "github_installation_id",
        "route_revision",
        "route_digest",
        "route_updated_by",
        "route_updated_at",
        "github_access_state",
        "github_access_checked_at",
        "github_access_permissions_digest",
        "github_settings_url",
    } <= policy_columns

    run_columns = {
        row[1] for row in database.execute("PRAGMA table_info(orchestration_runs)")
    }
    assert {
        "route_project_name",
        "route_repository",
        "route_github_installation_id",
        "route_revision",
        "route_digest",
        "route_start_state_name",
        "route_human_gate_state_id",
        "route_repository_revision",
        "route_workflow_revision",
        "route_review_revision",
    } <= run_columns

    delivery_columns = {row[1] for row in database.execute("PRAGMA table_info(deliveries)")}
    assert {"route_project_id", "route_revision", "route_digest"} <= delivery_columns

    tables = {
        row[0]
        for row in database.execute("SELECT name FROM sqlite_schema WHERE type = 'table'")
    }
    assert {
        "github_app_installations",
        "route_access_checks",
        "route_dispatch_results",
    } <= tables
    safe_columns = {
        row[1]
        for table in ("github_app_installations", "route_access_checks")
        for row in database.execute(f"PRAGMA table_info({table})")
    }
    assert not {"token", "private_key", "authorization", "raw_response"} & safe_columns


def test_route_migration_preserves_policy_active_run_history_and_revisions() -> None:
    database = sqlite3.connect(":memory:")
    apply_migrations(database, through="0019_portal_issue_search_history.sql")
    now = "2026-08-31T08:00:00.000Z"
    database.execute(
        """INSERT INTO workflow_definitions
           (definition_id, version, project_id, name, canonical_json, digest, created_at)
           VALUES ('simple', 4, 'project-1', 'simple', '{}', 'definition-digest', ?)""",
        (now,),
    )
    database.execute(
        """INSERT INTO project_workflow_policies
           (project_id, definition_id, definition_version, definition_digest,
            trial_repository, start_state_name, human_gate_state_id, dispatch_enabled,
            repository_revision, workflow_revision, independent_review_model,
            independent_review_revision, updated_at)
           VALUES ('project-1', 'simple', 4, 'definition-digest', 'owner/sample',
                   'Todo', 'human-review', 1, 7, 8, 'openai/model', 9, ?)""",
        (now,),
    )
    database.execute(
        """INSERT INTO orchestration_runs
           (run_id, correlation_id, run_sequence, project_id, issue_id, definition_id,
            definition_version, definition_digest, workflow_instance_id, current_node,
            current_visit_sequence, status, created_at, updated_at)
           VALUES ('run-1', 'correlation-1', 1, 'project-1', 'issue-1', 'simple', 4,
                   'definition-digest', 'workflow-1', 'author', 1, 'active', ?, ?)""",
        (now, now),
    )
    database.execute(
        """INSERT INTO workflow_transitions_v2
           (transition_id, run_id, from_node, to_node, from_visit_sequence,
            to_visit_sequence, cause_type, cause_reference, occurred_at)
           VALUES ('transition-1', 'run-1', 'start', 'author', 1, 2,
                   'provider_event', 'delivery-1', ?)""",
        (now,),
    )

    database.executescript(Path("migrations/0020_multi_repository_routes.sql").read_text())

    assert database.execute(
        """SELECT trial_repository, dispatch_enabled, repository_revision,
                  workflow_revision, independent_review_revision, route_revision,
                  github_access_state
           FROM project_workflow_policies WHERE project_id = 'project-1'"""
    ).fetchone() == ("owner/sample", 1, 7, 8, 9, 1, "unchecked")
    assert database.execute(
        "SELECT status FROM orchestration_runs WHERE run_id = 'run-1'"
    ).fetchone() == ("active",)
    assert database.execute(
        "SELECT to_node FROM workflow_transitions_v2 WHERE transition_id = 'transition-1'"
    ).fetchone() == ("author",)


def test_new_runs_can_store_a_complete_frozen_route() -> None:
    database = sqlite3.connect(":memory:")
    apply_migrations(database)
    now = "2026-08-31T08:00:00.000Z"
    database.execute(
        """INSERT INTO workflow_definitions
           (definition_id, version, project_id, name, canonical_json, digest, created_at)
           VALUES ('simple', 4, 'project-1', 'simple', '{}', 'definition-digest', ?)""",
        (now,),
    )
    database.execute(
        """INSERT INTO orchestration_runs
           (run_id, correlation_id, run_sequence, project_id, issue_id, definition_id,
            definition_version, definition_digest, workflow_instance_id, current_node,
            current_visit_sequence, status, route_project_name, route_repository,
            route_github_installation_id, route_revision, route_digest,
            route_start_state_name, route_human_gate_state_id, route_repository_revision,
            route_workflow_revision, route_review_revision, created_at, updated_at)
           VALUES ('run-1', 'correlation-1', 1, 'project-1', 'issue-1', 'simple', 4,
                   'definition-digest', 'workflow-1', 'author', 1, 'active', 'Sample',
                   'owner/sample', 'installation-1', 3, 'route-digest', 'Todo',
                   'human-review', 2, 4, 6, ?, ?)""",
        (now, now),
    )
    assert database.execute(
        """SELECT route_repository, route_github_installation_id, route_revision,
                  route_digest
           FROM orchestration_runs WHERE run_id = 'run-1'"""
    ).fetchone() == ("owner/sample", "installation-1", 3, "route-digest")


def test_credential_migration_preserves_a_lease_and_allows_concurrent_attempts() -> None:
    database = sqlite3.connect(":memory:")
    apply_migrations(database, through="0020_multi_repository_routes.sql")
    now = "2026-08-31T08:00:00.000Z"
    database.execute(
        """INSERT INTO workflow_definitions
           (definition_id, version, project_id, name, canonical_json, digest, created_at)
           VALUES ('simple', 4, 'project-1', 'simple', '{}', 'definition-digest', ?)""",
        (now,),
    )
    database.execute(
        """INSERT INTO orchestration_runs
           (run_id, correlation_id, run_sequence, project_id, issue_id, definition_id,
            definition_version, definition_digest, workflow_instance_id, current_node,
            current_visit_sequence, status, created_at, updated_at)
           VALUES ('run-1', 'correlation-1', 1, 'project-1', 'issue-1', 'simple', 4,
                   'definition-digest', 'workflow-1', 'author', 1, 'active', ?, ?)""",
        (now, now),
    )
    for sequence in (1, 2):
        database.execute(
            """INSERT INTO agent_attempts
               (attempt_id, sandbox_id, run_id, node_id, job_spec_json, job_spec_digest,
                state, absolute_deadline, cleanup_state, created_at, updated_at)
               VALUES (?, ?, 'run-1', 'author', '{}', ?, 'running', ?, 'pending', ?, ?)""",
            (
                f"attempt-{sequence}",
                f"sandbox-{sequence}",
                f"job-digest-{sequence}",
                "2026-08-31T09:00:00.000Z",
                now,
                now,
            ),
        )
    database.execute(
        """INSERT INTO credential_leases
           (profile_id, attempt_id, encrypted_object_key, object_version, object_etag,
            lease_expires_at, created_at, updated_at)
           VALUES ('controlled-trial', 'attempt-1', 'credentials/controlled-trial/auth.v1.enc',
                   '1', 'etag-1', '2026-08-31T09:00:00.000Z', ?, ?)""",
        (now, now),
    )

    database.executescript(Path("migrations/0021_concurrent_credential_leases.sql").read_text())
    database.execute(
        """INSERT INTO credential_leases
           (profile_id, attempt_id, encrypted_object_key, object_version, object_etag,
            lease_expires_at, created_at, updated_at)
           VALUES ('controlled-trial', 'attempt-2', 'credentials/controlled-trial/auth.v1.enc',
                   '1', 'etag-1', '2026-08-31T09:00:00.000Z', ?, ?)""",
        (now, now),
    )

    assert database.execute(
        """SELECT profile_id, attempt_id, object_etag
           FROM credential_leases ORDER BY attempt_id"""
    ).fetchall() == [
        ("controlled-trial", "attempt-1", "etag-1"),
        ("controlled-trial", "attempt-2", "etag-1"),
    ]
    assert database.execute("PRAGMA foreign_key_check").fetchall() == []
