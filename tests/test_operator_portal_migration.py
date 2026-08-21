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
