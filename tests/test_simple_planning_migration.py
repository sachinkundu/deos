import sqlite3
from pathlib import Path


def migrated_database() -> sqlite3.Connection:
    database = sqlite3.connect(":memory:")
    database.execute("PRAGMA foreign_keys = ON")
    for migration in sorted(Path("migrations").glob("*.sql")):
        database.executescript(migration.read_text())
    return database


def seed_run(database: sqlite3.Connection) -> None:
    database.execute(
        """INSERT INTO workflow_definitions
           (definition_id, version, project_id, name, canonical_json, digest, created_at)
           VALUES ('simple', 1, 'project-1', 'simple', '{}', 'simple-digest', '2026-08-23T00:00:00Z')"""
    )
    database.execute(
        """INSERT INTO orchestration_runs
           (run_id, correlation_id, run_sequence, project_id, issue_id, definition_id,
            definition_version, definition_digest, workflow_instance_id, current_node,
            status, created_at, updated_at)
           VALUES ('run-1', 'correlation-1', 1, 'project-1', 'issue-1', 'simple', 1,
                   'simple-digest', 'instance-1', 'openspec_planning', 'active',
                   '2026-08-23T00:00:00Z', '2026-08-23T00:00:00Z')"""
    )


def test_simple_planning_migration_is_additive_and_selector_is_disabled() -> None:
    database = migrated_database()
    seed_run(database)
    database.execute(
        """INSERT INTO workflow_definition_selectors
           (project_id, repository, label_name, definition_id, definition_version,
            definition_digest, created_at, updated_at)
           VALUES ('project-1', 'sachinkundu/deos', 'simple-workflow', 'simple', 1,
                   'simple-digest', '2026-08-23T00:00:00Z', '2026-08-23T00:00:00Z')"""
    )
    assert database.execute("SELECT enabled FROM workflow_definition_selectors").fetchone() == (0,)
    try:
        database.execute(
            """INSERT INTO workflow_definition_selectors
               (project_id, repository, label_name, definition_id, definition_version,
                definition_digest, created_at, updated_at)
               VALUES ('project-1', 'sachinkundu/deos', 'bad', 'missing', 1,
                       'missing', '2026-08-23T00:00:00Z', '2026-08-23T00:00:00Z')"""
        )
    except sqlite3.IntegrityError:
        pass
    else:
        raise AssertionError("selector foreign key must be enforced")
    columns = {row[1] for row in database.execute("PRAGMA table_info(orchestration_runs)")}
    assert {
        "selection_kind",
        "selection_value",
        "selection_label_name",
        "selection_reason",
        "selection_evidence_json",
        "selection_delivery_id",
        "selection_observed_at",
        "selection_provider_digest",
    } <= columns
    delivery_columns = {row[1] for row in database.execute("PRAGMA table_info(deliveries)")}
    assert {
        "label_selection_evidence_json",
        "label_selection_evidence_digest",
    } <= delivery_columns


def test_run_work_product_and_prompt_evidence_enforce_stable_identity() -> None:
    database = migrated_database()
    seed_run(database)
    database.execute(
        """INSERT INTO run_work_products
           (run_id, repository, base_branch, remote_branch, change_id, created_at, updated_at)
           VALUES ('run-1', 'sachinkundu/deos', 'main', 'deos/planning/aaaaaaaaaaaaaaaaaaaaaaaa',
                   'sac-200', '2026-08-23T00:00:00Z', '2026-08-23T00:00:00Z')"""
    )
    database.execute(
        """INSERT INTO orchestration_runs
           (run_id, correlation_id, run_sequence, project_id, issue_id, definition_id,
            definition_version, definition_digest, workflow_instance_id, current_node,
            status, created_at, updated_at, terminal_at)
           VALUES ('run-2', 'correlation-2', 1, 'project-1', 'issue-2', 'simple', 1,
                   'simple-digest', 'instance-2', 'done', 'succeeded',
                   '2026-08-23T00:00:00Z', '2026-08-23T00:00:00Z',
                   '2026-08-23T00:00:00Z')"""
    )
    try:
        database.execute(
            """INSERT INTO run_work_products
               (run_id, repository, base_branch, remote_branch, change_id, created_at, updated_at)
               VALUES ('run-2', 'sachinkundu/deos', 'main', 'deos/planning/aaaaaaaaaaaaaaaaaaaaaaaa',
                       'sac-201', '2026-08-23T00:00:00Z', '2026-08-23T00:00:00Z')"""
        )
    except sqlite3.IntegrityError:
        pass
    else:
        raise AssertionError("planning branch identity must be unique")
    database.execute(
        """INSERT INTO agent_attempts
           (attempt_id, sandbox_id, run_id, node_id, visit_sequence, job_spec_json,
            job_spec_digest, state, absolute_deadline, prompt_r2_key, prompt_sha256,
            created_at, updated_at)
           VALUES ('attempt-1', 'sandbox-1', 'run-1', 'openspec_planning', 1, '{}',
                   'job-digest', 'pending', '2026-08-24T00:00:00Z',
                   'protected/prompts/attempt-1.md', 'prompt-digest',
                   '2026-08-23T00:00:00Z', '2026-08-23T00:00:00Z')"""
    )
    assert database.execute(
        "SELECT prompt_r2_key, prompt_sha256 FROM agent_attempts WHERE attempt_id = 'attempt-1'"
    ).fetchone() == ("protected/prompts/attempt-1.md", "prompt-digest")
