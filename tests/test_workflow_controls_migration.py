import sqlite3
from pathlib import Path


def migrated_database() -> sqlite3.Connection:
    database = sqlite3.connect(":memory:")
    database.execute("PRAGMA foreign_keys = ON")
    for migration in sorted(Path("migrations").glob("*.sql")):
        database.executescript(migration.read_text())
    return database


def test_workflow_controls_start_off_with_their_own_revision() -> None:
    database = migrated_database()
    database.execute(
        """INSERT INTO workflow_definitions
           (definition_id, version, project_id, name, canonical_json, digest, created_at)
           VALUES ('full', 1, 'project-1', 'full', '{}', 'full-digest',
                   '2026-08-25T00:00:00Z')"""
    )
    database.execute(
        """INSERT INTO project_workflow_policies
           (project_id, definition_id, definition_version, definition_digest,
            trial_repository, start_state_name, human_gate_state_id, updated_at)
           VALUES ('project-1', 'full', 1, 'full-digest', 'owner/repository',
                   'Todo', 'human-review', '2026-08-25T00:00:00Z')"""
    )
    assert database.execute(
        """SELECT dispatch_enabled, workflow_revision, workflow_updated_by,
                  workflow_updated_at
           FROM project_workflow_policies WHERE project_id = 'project-1'"""
    ).fetchone() == (0, 1, "deployment", "1970-01-01T00:00:00.000Z")


def test_workflow_control_columns_are_additive() -> None:
    database = migrated_database()
    columns = {row[1] for row in database.execute("PRAGMA table_info(project_workflow_policies)")}
    assert {"workflow_revision", "workflow_updated_by", "workflow_updated_at"} <= columns
