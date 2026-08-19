from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]


def apply_migration(connection: sqlite3.Connection, name: str) -> None:
    sql = (ROOT / "migrations" / name).read_text()
    connection.executescript(f"BEGIN;\n{sql}\nCOMMIT;")


def test_explicit_lifecycle_migration_preserves_history_and_guards_active_runs(
    tmp_path: Path,
) -> None:
    connection = sqlite3.connect(tmp_path / "lifecycle.sqlite")
    connection.execute("PRAGMA foreign_keys = ON")
    for name in (
        "0001_initial.sql",
        "0002_workflow_dispatch.sql",
        "0003_queue_consumptions.sql",
        "0004_idempotent_workflow_transitions.sql",
        "0005_workflow_correlation.sql",
        "0006_sandbox_orchestration.sql",
        "0007_workflow_visit_identity.sql",
    ):
        apply_migration(connection, name)

    connection.execute(
        """INSERT INTO workflow_definitions
           (definition_id, version, project_id, name, canonical_json, digest, created_at)
           VALUES ('delivery', 3, 'project-1', 'delivery', '{}', 'digest-v3', 'now')"""
    )
    connection.execute(
        """INSERT INTO orchestration_runs
           (run_id, correlation_id, run_sequence, project_id, issue_id, definition_id,
            definition_version, definition_digest, workflow_instance_id, current_node,
            status, created_at, updated_at, terminal_at)
           VALUES ('run-1', 'workflow:project-1:issue-1', 1, 'project-1', 'issue-1',
                   'delivery', 3, 'digest-v3', 'instance-1', 'blocked', 'blocked',
                   'created', 'updated', 'terminal')"""
    )
    connection.execute(
        """INSERT INTO dispatch_intents
           (run_id, source_delivery_id, workflow_instance_id, state, created_at, updated_at)
           VALUES ('run-1', 'delivery-1', 'instance-1', 'established', 'created', 'updated')"""
    )
    connection.commit()

    connection.execute(
        "UPDATE orchestration_runs SET current_visit_sequence = 3, last_transition_id = 'transition-2' WHERE run_id = 'run-1'"
    )

    apply_migration(connection, "0008_explicit_business_lifecycle.sql")

    legacy = connection.execute(
        "SELECT status, terminal_at, current_visit_sequence, last_transition_id FROM orchestration_runs WHERE run_id = 'run-1'"
    ).fetchone()
    assert legacy == ("blocked", "terminal", 3, "transition-2")
    assert connection.execute("PRAGMA foreign_key_check").fetchall() == []
    assert connection.execute(
        "SELECT run_id FROM dispatch_intents WHERE run_id = 'run-1'"
    ).fetchone() == ("run-1",)

    connection.execute(
        """INSERT INTO orchestration_runs
           (run_id, correlation_id, run_sequence, project_id, issue_id, definition_id,
            definition_version, definition_digest, workflow_instance_id, current_node,
            status, created_at, updated_at)
           VALUES ('run-2', 'workflow:project-1:issue-1', 2, 'project-1', 'issue-1',
                   'delivery', 3, 'digest-v3', 'instance-2', 'wait',
                   'awaiting_capability', 'created', 'updated')"""
    )
    with pytest.raises(sqlite3.IntegrityError):
        connection.execute(
            """INSERT INTO orchestration_runs
               (run_id, correlation_id, run_sequence, project_id, issue_id, definition_id,
                definition_version, definition_digest, workflow_instance_id, current_node,
                status, created_at, updated_at)
               VALUES ('run-3', 'workflow:project-1:issue-1', 3, 'project-1', 'issue-1',
                       'delivery', 3, 'digest-v3', 'instance-3', 'active',
                       'active', 'created', 'updated')"""
        )


def test_wait_constraints_prevent_duplicate_consumption(tmp_path: Path) -> None:
    connection = sqlite3.connect(tmp_path / "waits.sqlite")
    connection.execute("PRAGMA foreign_keys = ON")
    for migration in sorted((ROOT / "migrations").glob("*.sql")):
        apply_migration(connection, migration.name)
    connection.execute(
        """INSERT INTO workflow_definitions
           (definition_id, version, project_id, name, canonical_json, digest, created_at)
           VALUES ('delivery', 4, 'project-1', 'delivery', '{}', 'digest-v4', 'now')"""
    )
    connection.execute(
        """INSERT INTO orchestration_runs
           (run_id, correlation_id, run_sequence, project_id, issue_id, definition_id,
            definition_version, definition_digest, workflow_instance_id, current_node,
            status, created_at, updated_at)
           VALUES ('run-1', 'correlation-1', 1, 'project-1', 'issue-1', 'delivery', 4,
                   'digest-v4', 'instance-1', 'wait', 'awaiting_capability', 'now', 'now')"""
    )
    for delivery in ("delivery-1", "delivery-2"):
        connection.execute(
            """INSERT INTO workflow_event_inbox
               (delivery_id, run_id, correlation_id, event_kind, provider_time,
                to_state_name, payload_digest, state, created_at)
               VALUES (?, 'run-1', 'correlation-1', 'Issue.update', 'now',
                       'In Progress', ?, 'claimed', 'now')""",
            (delivery, f"digest-{delivery}"),
        )
    connection.execute(
        """INSERT INTO workflow_waits
           (wait_id, run_id, node_id, status, resume_event_type, resume_event_json,
            resume_event_digest, cancel_event_type, cancel_event_json,
            cancel_event_digest, cause_reference, created_at, consumed_delivery_id)
           VALUES ('wait-1', 'run-1', 'wait', 'consumed', 'linear.issue.state_changed',
                   '{}', 'resume', 'linear.issue.state_changed', '{}', 'cancel',
                   'missing_receipt', 'now', 'delivery-1')"""
    )
    with pytest.raises(sqlite3.IntegrityError):
        connection.execute(
            """INSERT INTO workflow_waits
               (wait_id, run_id, node_id, status, resume_event_type, resume_event_json,
                resume_event_digest, cancel_event_type, cancel_event_json,
                cancel_event_digest, cause_reference, created_at, consumed_delivery_id)
               VALUES ('wait-2', 'run-1', 'wait', 'consumed', 'linear.issue.state_changed',
                       '{}', 'resume', 'linear.issue.state_changed', '{}', 'cancel',
                       'missing_receipt', 'now', 'delivery-1')"""
        )
