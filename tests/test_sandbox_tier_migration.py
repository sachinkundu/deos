import sqlite3
from pathlib import Path

import pytest


def database() -> sqlite3.Connection:
    db = sqlite3.connect(":memory:")
    db.execute("PRAGMA foreign_keys=ON")
    for migration in sorted(Path("migrations").glob("*.sql")):
        db.executescript(migration.read_text())
    db.executescript("""
        INSERT INTO workflow_definitions
        (definition_id,version,project_id,name,canonical_json,digest,created_at)
        VALUES ('test',1,'project','test','{}','digest','now');
        INSERT INTO orchestration_runs
        (run_id,correlation_id,run_sequence,project_id,issue_id,definition_id,
         definition_version,definition_digest,workflow_instance_id,current_node,status,created_at,updated_at)
        VALUES ('run','correlation',1,'project','issue','test',1,'digest','instance','author','active','now','now');
        INSERT INTO agent_attempts
        (attempt_id,sandbox_id,run_id,node_id,job_spec_json,job_spec_digest,state,absolute_deadline,created_at,updated_at)
        VALUES ('attempt','sandbox','run','author','{}','digest','running','later','now','now');
    """)
    return db


def test_backfill_is_repeatable_and_never_rewrites_a_recorded_tier() -> None:
    db = database()
    sql = Path("scripts/sandbox-tier-backfill.sql").read_text()
    db.executescript(sql)
    db.executescript(sql)
    assert db.execute("SELECT sandbox_tier,sandbox_tier_source FROM orchestration_runs").fetchone() == ("basic", "legacy_basic")
    assert db.execute("SELECT sandbox_tier FROM agent_attempts").fetchone() == ("basic",)
    assert db.execute(Path("scripts/sandbox-tier-validate.sql").read_text()).fetchone() == (0, 0, 0)
    with pytest.raises(sqlite3.IntegrityError, match="immutable"):
        db.execute("UPDATE orchestration_runs SET sandbox_tier='standard-2'")
    with pytest.raises(sqlite3.IntegrityError, match="immutable"):
        db.execute("UPDATE agent_attempts SET sandbox_tier='standard-2'")


def test_enforced_attempt_tier_must_match_run() -> None:
    db = database()
    db.executescript(Path("scripts/sandbox-tier-backfill.sql").read_text())
    db.executescript(Path("scripts/sandbox-tier-enforce.sql").read_text())
    for tier in (None, "standard-2"):
        with pytest.raises(sqlite3.IntegrityError, match="saved run tier"):
            db.execute("""INSERT INTO agent_attempts
                (attempt_id,sandbox_id,run_id,node_id,job_spec_json,job_spec_digest,state,
                 absolute_deadline,created_at,updated_at,sandbox_tier)
                VALUES ('retry','retry','run','author','{}','digest','pending','later','now','now',?)""", (tier,))


def test_accepted_delivery_evidence_cannot_change() -> None:
    db = database()
    db.execute("""INSERT INTO deliveries
        (delivery_id,payload_hash,received_at,classification,correlation_id,start_slow_ok,sandbox_tier_policy_version)
        VALUES ('delivery','digest','now','relevant','correlation',1,'event-label-v1')""")
    with pytest.raises(sqlite3.IntegrityError, match="immutable"):
        db.execute("UPDATE deliveries SET start_slow_ok=NULL")
    with pytest.raises(sqlite3.IntegrityError, match="immutable"):
        db.execute("UPDATE deliveries SET sandbox_tier_policy_version='legacy-basic-v1'")
