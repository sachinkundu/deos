import sqlite3
from pathlib import Path


def migrated_database() -> sqlite3.Connection:
    database = sqlite3.connect(":memory:")
    database.execute("PRAGMA foreign_keys = ON")
    for migration in sorted(Path("migrations").glob("*.sql")):
        database.executescript(migration.read_text())
    return database


def test_trace_review_storage_is_additive_and_secret_free() -> None:
    database = migrated_database()
    tables = {
        row[0]
        for row in database.execute(
            "SELECT name FROM sqlite_schema WHERE type = 'table'"
        )
    }
    assert {
        "planning_candidates",
        "trace_review_phases",
        "trace_reviews",
        "trace_review_head_bindings",
    } <= tables
    policy_columns = {
        row[1]
        for row in database.execute("PRAGMA table_info(project_workflow_policies)")
    }
    assert {
        "independent_review_provider",
        "independent_review_model",
        "independent_review_revision",
    } <= policy_columns
    run_columns = {
        row[1] for row in database.execute("PRAGMA table_info(orchestration_runs)")
    }
    assert {
        "author_model_provider",
        "author_model",
        "author_reasoning",
        "independent_review_provider",
        "independent_review_model",
        "independent_review_reasoning",
    } <= run_columns
    attempt_columns = {
        row[1] for row in database.execute("PRAGMA table_info(agent_attempts)")
    }
    assert "result_detail" in attempt_columns
    all_columns = {
        row[1]
        for table in (
            "planning_candidates",
            "trace_review_phases",
            "trace_reviews",
            "trace_review_head_bindings",
        )
        for row in database.execute(f"PRAGMA table_info({table})")
    }
    assert not {"api_key", "access_token", "secret"} & all_columns


def test_review_phase_and_result_enums_reject_unknown_values() -> None:
    database = migrated_database()
    phase_sql = database.execute(
        "SELECT sql FROM sqlite_schema WHERE name = 'trace_review_phases'"
    ).fetchone()[0]
    review_sql = database.execute(
        "SELECT sql FROM sqlite_schema WHERE name = 'trace_reviews'"
    ).fetchone()[0]
    for value in (
        "awaiting_discovery",
        "awaiting_recheck",
        "proof_conflict",
        "closed_needs_judgment",
        "stopped",
    ):
        assert value in phase_sql
    for value in ("discovery", "recheck", "pass", "needs_judgment"):
        assert value in review_sql
