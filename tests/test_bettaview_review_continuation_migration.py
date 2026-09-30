import sqlite3
from pathlib import Path

import pytest


def migrated_database() -> sqlite3.Connection:
    database = sqlite3.connect(":memory:")
    database.execute("PRAGMA foreign_keys = ON")
    for migration in sorted(Path("migrations").glob("*.sql")):
        database.executescript(migration.read_text())
    return database


def test_review_continuation_migration_is_additive_and_feature_disabled() -> None:
    database = migrated_database()
    policy = {row[1]: row for row in database.execute("PRAGMA table_info(project_workflow_policies)")}
    run = {row[1]: row for row in database.execute("PRAGMA table_info(orchestration_runs)")}
    assert policy["bettaview_continuation_enabled"][4] == "0"
    assert {"in_progress_state_id", "merging_state_id"} <= policy.keys()
    assert {"frozen_access_account", "frozen_github_user_id", "frozen_linear_user_id", "bettaview_account_policy_version"} <= run.keys()
    expected = {
        "project_bettaview_accounts", "bettaview_account_audit", "review_intents", "review_content_items",
        "review_continuation_leases", "review_parts", "review_attempts", "review_proof_nonces",
        "review_action_tokens", "review_ready_events", "review_faults", "review_repairs", "review_ops_items",
    }
    tables = {row[0] for row in database.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert expected <= tables
    assert database.execute("PRAGMA foreign_key_check").fetchall() == []


def test_checked_account_constraints_and_rotation_are_fail_closed() -> None:
    database = migrated_database()
    values = ("project-1", 1, "person@example.com", 42, "linear-user", "a" * 64, "admin@example.com", 1,
              "current", "human", "progress", "merging", "now", "now")
    database.execute("""INSERT INTO project_bettaview_accounts
      (project_id,policy_version,access_account,github_user_id,linear_user_id,provider_evidence_digest,
       settings_actor,route_revision,status,human_review_state_id,in_progress_state_id,merging_state_id,created_at,activated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)""", values)
    with pytest.raises(sqlite3.IntegrityError):
        database.execute("""INSERT INTO project_bettaview_accounts
          (project_id,policy_version,access_account,github_user_id,linear_user_id,provider_evidence_digest,
           settings_actor,route_revision,status,human_review_state_id,in_progress_state_id,merging_state_id,created_at,activated_at)
          VALUES('project-1',2,'other@example.com',43,'other',?,'admin',1,'current','human','progress','merging','now','now')""", ("b" * 64,))
    with pytest.raises(sqlite3.IntegrityError):
        database.execute("UPDATE project_bettaview_accounts SET github_user_id=99 WHERE project_id='project-1'")


def test_frozen_run_identity_is_all_or_none() -> None:
    database = migrated_database()
    database.execute("""INSERT INTO workflow_definitions
      (definition_id,version,project_id,name,canonical_json,digest,created_at)
      VALUES('definition',1,'project-1','test','{}','digest','now')""")
    base = """INSERT INTO orchestration_runs
      (run_id,correlation_id,run_sequence,project_id,issue_id,definition_id,definition_version,
       definition_digest,workflow_instance_id,current_node,status,created_at,updated_at%s)
      VALUES('run-1','correlation',1,'project-1','issue','definition',1,'digest','instance','node','active','now','now'%s)"""
    with pytest.raises(sqlite3.IntegrityError, match="all-or-none"):
        database.execute(base % (",frozen_access_account", ",'person@example.com'"))
    database.execute(base % (",frozen_access_account,frozen_github_user_id,frozen_linear_user_id,bettaview_account_policy_version", ",'person@example.com',42,'linear-user',1"))
    with pytest.raises(sqlite3.IntegrityError, match="immutable"):
        database.execute("UPDATE orchestration_runs SET frozen_github_user_id=43 WHERE run_id='run-1'")
