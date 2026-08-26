import sqlite3
from pathlib import Path


def test_operator_portal_migration_is_additive_and_read_model_columns_exist() -> None:
    database = sqlite3.connect(":memory:")
    database.execute("PRAGMA foreign_keys = ON")
    for migration in sorted(Path("migrations").glob("*.sql")):
        database.executescript(migration.read_text())

    tables = {
        row[0]
        for row in database.execute(
            "SELECT name FROM sqlite_schema WHERE type = 'table'"
        ).fetchall()
    }
    assert {"linear_issue_index", "governed_work_links"} <= tables

    attempt_columns = {
        row[1] for row in database.execute("PRAGMA table_info(agent_attempts)").fetchall()
    }
    wait_columns = {
        row[1] for row in database.execute("PRAGMA table_info(workflow_waits)").fetchall()
    }
    assert "visit_sequence" in attempt_columns
    assert "visit_sequence" in wait_columns

    link_columns = {
        row[1] for row in database.execute("PRAGMA table_info(governed_work_links)")
    }
    assert "attempt_id" in link_columns

    link_sql = database.execute(
        "SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'governed_work_links'"
    ).fetchone()[0]
    assert "openspec_artifact" in link_sql
    assert "operation_id TEXT NOT NULL UNIQUE" not in link_sql


def test_confirmed_planning_publication_backfills_pr_and_every_manifest_file() -> None:
    database = sqlite3.connect(":memory:")
    database.execute("PRAGMA foreign_keys = ON")
    migrations = sorted(Path("migrations").glob("*.sql"))
    for migration in migrations:
        if migration.name == "0012_governed_planning_links.sql":
            break
        database.executescript(migration.read_text())

    database.execute(
        """INSERT INTO workflow_definitions
           (definition_id, version, project_id, name, canonical_json, digest, created_at)
           VALUES ('simple', 2, 'project-1', 'simple', '{}', 'simple-v2', '2026-08-24T00:00:00Z')"""
    )
    database.execute(
        """INSERT INTO orchestration_runs
           (run_id, correlation_id, run_sequence, project_id, issue_id, definition_id,
            definition_version, definition_digest, workflow_instance_id, current_node,
            current_visit_sequence, status, created_at, updated_at)
           VALUES ('run-129', 'correlation-129', 9, 'project-1', 'issue-129', 'simple', 2,
                   'simple-v2', 'instance-129', 'done', 8, 'succeeded',
                   '2026-08-24T12:25:00Z', '2026-08-24T13:22:26Z')"""
    )
    database.execute(
        """INSERT INTO agent_attempts
           (attempt_id, sandbox_id, run_id, node_id, visit_sequence, job_spec_json,
            job_spec_digest, state, absolute_deadline, created_at, updated_at)
           VALUES ('attempt-129', 'sandbox-129', 'run-129', 'openspec_planning', 4, '{}',
                   'job-digest', 'completed', '2026-08-25T00:00:00Z',
                   '2026-08-24T12:55:47Z', '2026-08-24T13:01:14Z')"""
    )
    operation_id = "run-129:capability:github:publish_planning_work_product:attempt-129:1"
    database.execute(
        """INSERT INTO provider_operations
           (operation_id, run_id, attempt_id, capability, action, sanitized_target,
            request_digest, state, provider_resource_id, started_at, updated_at, completed_at)
           VALUES (?, 'run-129', 'attempt-129', 'github', 'publish_planning_work_product',
                   'sachinkundu/deos:branch', 'request-digest', 'succeeded', '4348421622',
                   '2026-08-24T13:00:00Z', '2026-08-24T13:01:00Z', '2026-08-24T13:01:00Z')""",
        (operation_id,),
    )
    manifest = (
        '[{"path":"openspec/changes/sac-129/.openspec.yaml"},'
        '{"path":"openspec/changes/sac-129/proposal.md"},'
        '{"path":"openspec/changes/sac-129/specs/calculator-cli/spec.md"}]'
    )
    database.execute(
        """INSERT INTO run_work_products
           (run_id, repository, base_branch, remote_branch, change_id,
            pull_request_database_id, pull_request_number, pull_request_url, head_sha,
            planning_manifest_digest, planning_manifest_json, latest_publication_operation_id,
            created_at, updated_at)
           VALUES ('run-129', 'sachinkundu/deos', 'main', 'deos/planning/branch', 'sac-129',
                   '4348421622', 59, 'https://github.com/sachinkundu/deos/pull/59',
                   '65bdc746ffa6826ee0786ab1720ffa3ee057460d', 'manifest-digest', ?, ?,
                   '2026-08-24T12:25:00Z', '2026-08-24T13:01:00Z')""",
        (manifest, operation_id),
    )

    database.executescript(Path("migrations/0012_governed_planning_links.sql").read_text())
    links = database.execute(
        """SELECT visit_sequence, attempt_id, operation_id, kind, label, url
           FROM governed_work_links ORDER BY kind DESC, label"""
    ).fetchall()
    assert len(links) == 4
    assert {row[3] for row in links} == {"pull_request", "openspec_artifact"}
    assert {row[2] for row in links} == {operation_id}
    assert {row[0] for row in links} == {4}
    assert next(row[5] for row in links if row[3] == "pull_request") == (
        "https://github.com/sachinkundu/deos/pull/59"
    )
    artifact_urls = {row[5] for row in links if row[3] == "openspec_artifact"}
    assert all("/blob/65bdc746ffa6826ee0786ab1720ffa3ee057460d/" in url for url in artifact_urls)
