import sqlite3
from pathlib import Path


def migrated_database() -> sqlite3.Connection:
    database = sqlite3.connect(":memory:")
    database.execute("PRAGMA foreign_keys=ON")
    for migration in sorted(Path("migrations").glob("*.sql")):
        database.executescript(migration.read_text())
    return database


def test_shared_site_starts_free_and_cannot_be_free_with_an_owner() -> None:
    database = migrated_database()
    assert database.execute(
        "SELECT state,owner_run_id,owner_lease_id FROM test_environment WHERE site_id=1"
    ).fetchone() == ("free", None, None)
    try:
        database.execute(
            "UPDATE test_environment SET owner_run_id='run',owner_lease_id='lease' WHERE site_id=1"
        )
    except sqlite3.IntegrityError:
        pass
    else:
        raise AssertionError("free site accepted an owner")
    assert database.execute("SELECT state FROM staging_release_pointer").fetchone() == (
        "uninitialized",
    )
    database.close()


def test_one_waiting_candidate_per_run_visit() -> None:
    database = migrated_database()
    row = ("run", 3, "attempt", "task", "a" * 40, "b" * 64, "waiting", "now", "now")
    sql = """INSERT INTO test_lease_requests
      (request_id,run_id,node_visit,attempt_id,task_id,candidate_commit,patch_sha256,state,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)"""
    database.execute(sql, ("request-1", *row))
    try:
        database.execute(sql, ("request-2", "run", 3, "attempt-2", "task", "c" * 40,
                               "b" * 64, "waiting", "now", "now"))
    except sqlite3.IntegrityError:
        pass
    else:
        raise AssertionError("two candidates were allowed to wait in one visit")
    database.close()
