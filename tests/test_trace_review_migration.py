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
        "openrouter_response_receipts",
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
    diagnostic_columns = {
        row[1] for row in database.execute("PRAGMA table_info(diagnostics)")
    }
    assert {
        "operation_id",
        "provider",
        "failure_stage",
        "http_status",
        "provider_code",
        "provider_request_id",
        "response_body_sha256",
        "request_may_have_succeeded",
        "retryable",
        "safe_message",
    } <= diagnostic_columns
    review_columns = {
        row[1] for row in database.execute("PRAGMA table_info(trace_reviews)")
    }
    assert {"agent_harness", "agent_harness_version"} <= review_columns
    response_columns = {
        row[1]
        for row in database.execute("PRAGMA table_info(openrouter_response_receipts)")
    }
    assert {
        "operation_id",
        "r2_key",
        "response_sha256",
        "http_status",
        "content_type",
        "provider_request_id",
    } <= response_columns
    retry_columns = {
        row[1]
        for row in database.execute("PRAGMA table_info(agent_stage_retries)")
    }
    assert {
        "retry_kind",
        "source_definition_id",
        "source_definition_version",
        "source_definition_digest",
        "target_definition_id",
        "target_definition_version",
        "target_definition_digest",
        "source_workflow_instance_id",
        "target_workflow_instance_id",
        "source_delivery_id",
    } <= retry_columns
    retry_sql = database.execute(
        "SELECT sql FROM sqlite_schema WHERE name = 'agent_stage_retries'"
    ).fetchone()[0]
    assert "planning_revision_author" in retry_sql
    assert "design_author" in retry_sql
    assert "design_revision_author" in retry_sql
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
