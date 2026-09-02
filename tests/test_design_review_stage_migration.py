import sqlite3
from pathlib import Path

import pytest


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
           VALUES ('simple-traceability', 17, 'project-1', 'test', '{}', 'digest', 'now')"""
    )
    database.execute(
        """INSERT INTO orchestration_runs
           (run_id, correlation_id, run_sequence, project_id, issue_id, definition_id,
            definition_version, definition_digest, workflow_instance_id, current_node,
            current_visit_sequence, status, created_at, updated_at)
           VALUES ('run-1', 'correlation-1', 1, 'project-1', 'issue-1',
                   'simple-traceability', 17, 'digest', 'instance-1', 'design_review',
                   20, 'active', 'now', 'now')"""
    )
    database.execute(
        """INSERT INTO agent_attempts
           (attempt_id, sandbox_id, run_id, node_id, job_spec_json, job_spec_digest,
            state, absolute_deadline, created_at, updated_at)
           VALUES ('attempt-1', 'sandbox-1', 'run-1', 'design_author', '{}', 'digest',
                   'completed', 'later', 'now', 'now')"""
    )
    for operation_id, action in (("publish-1", "publish"), ("merge-1", "merge")):
        database.execute(
            """INSERT INTO provider_operations
               (operation_id, run_id, capability, action, sanitized_target, request_digest,
                state, started_at, updated_at)
               VALUES (?, 'run-1', 'system_action', ?, 'design', 'digest',
                       'succeeded', 'now', 'now')""",
            (operation_id, action),
        )


def test_design_stage_tables_are_additive_and_foreign_keys_hold() -> None:
    database = migrated_database()
    seed_run(database)
    prior_runs = database.execute(
        "SELECT run_id, current_node FROM orchestration_runs"
    ).fetchall()
    database.execute(
        """INSERT INTO design_work_products
           (run_id, repository, base_branch, base_commit, remote_branch, change_id,
            pull_request_database_id, pull_request_number, pull_request_url, head_sha,
            design_manifest_digest, design_manifest_json, publication_operation_id,
            created_at, updated_at)
           VALUES ('run-1', 'acme/repo', 'main', ?, 'deos/design/0123456789abcdef01234567',
                   'sample-change', 'PR_node', 12, 'https://github.com/acme/repo/pull/12', ?,
                   ?, '[{"path":"openspec/changes/sample-change/design.md"}]',
                   'publish-1', 'now', 'now')""",
        ("a" * 40, "b" * 40, "c" * 64),
    )
    database.execute(
        """INSERT INTO design_candidates
           (candidate_id, run_id, round, source_attempt_id, base_commit, change_id,
            design_digest, candidate_digest, candidate_r2_key, candidate_sha256,
            validation_r2_key, validation_sha256, state, created_at, accepted_at)
           VALUES ('candidate-1', 'run-1', 1, 'attempt-1', ?, 'sample-change', ?, ?,
                   'design/candidate-1.json', ?, 'design/candidate-1.validation.json', ?,
                   'validated', 'now', 'now')""",
        ("a" * 40, "d" * 64, "e" * 64, "f" * 64, "0" * 64),
    )
    database.execute(
        """INSERT INTO human_gate_visits
           (run_id, visit_sequence, node_id, gate_kind, work_type, work_product_kind,
            round, state, repository, pull_request_database_id, pull_request_number,
            pull_request_url, head_branch, base_branch, approved_head_sha, created_at)
           VALUES ('run-1', 20, 'design_review', 'design', 'design', 'design', 1, 'open',
                   'acme/repo', 'PR_node', 12, 'https://github.com/acme/repo/pull/12',
                   'deos/design/0123456789abcdef01234567', 'main', ?, 'now')""",
        ("b" * 40,),
    )
    assert database.execute("PRAGMA foreign_key_check").fetchall() == []
    assert database.execute(
        "SELECT run_id, current_node FROM orchestration_runs"
    ).fetchall() == prior_runs


def test_design_stage_constraints_fail_closed() -> None:
    database = migrated_database()
    seed_run(database)
    with pytest.raises(sqlite3.IntegrityError):
        database.execute(
            """INSERT INTO human_gate_visits
               (run_id, visit_sequence, node_id, gate_kind, work_type, work_product_kind,
                round, state, repository, pull_request_database_id, pull_request_number,
                pull_request_url, head_branch, base_branch, approved_head_sha, created_at)
               VALUES ('run-1', 20, 'design_review', 'design', 'proposal_and_specs',
                       'planning', 1, 'open', 'acme/repo', 'PR', 1,
                       'https://github.com/acme/repo/pull/1', 'branch', 'main', ?, 'now')""",
            ("a" * 40,),
        )
    with pytest.raises(sqlite3.IntegrityError):
        database.execute(
            """INSERT INTO design_work_products
               (run_id, repository, base_branch, base_commit, remote_branch, change_id,
                created_at, updated_at)
               VALUES ('missing-run', 'acme/repo', 'main', ?, 'deos/design/aaaaaaaaaaaaaaaaaaaaaaaa',
                       'change', 'now', 'now')""",
            ("a" * 40,),
        )

