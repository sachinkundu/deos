from __future__ import annotations

import hashlib
import asyncio
import sqlite3
from datetime import UTC, datetime
from pathlib import Path

from deos.shared_test_event import TestExpectation as EventExpectation, marker_for
from deos.shared_test_route import SharedTestEventRouter


class Statement:
    def __init__(self, db: sqlite3.Connection, sql: str, values: tuple = ()) -> None:
        self.db, self.sql, self.values = db, sql, values

    def bind(self, *values: object) -> Statement:
        return Statement(self.db, self.sql, values)

    async def first(self) -> dict | None:
        row = self.db.execute(self.sql, self.values).fetchone()
        return dict(row) if row else None

    async def all(self) -> dict:
        return {"results": [dict(row) for row in self.db.execute(self.sql, self.values)]}

    async def run(self) -> dict:
        return {"changes": self.db.execute(self.sql, self.values).rowcount}


class Database:
    def __init__(self) -> None:
        self.sqlite = sqlite3.connect(":memory:", isolation_level=None)
        self.sqlite.row_factory = sqlite3.Row
        self.sqlite.executescript(Path("migrations/0055_shared_test_environment.sql").read_text())

    def prepare(self, sql: str) -> Statement:
        return Statement(self.sqlite, sql)

    async def batch(self, statements: list[Statement]) -> None:
        self.sqlite.execute("BEGIN")
        try:
            for statement in statements:
                await statement.run()
            self.sqlite.execute("COMMIT")
        except Exception:
            self.sqlite.execute("ROLLBACK")
            raise


def sha(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


async def _check_exact_provider_event() -> None:
    db = Database()
    sent: list[object] = []

    async def send(message: object) -> None:
        sent.append(message)

    try:
        time_ms = 1790310701176
        key = b"test-marker-key"
        before = "Task description\n"
        expectation = EventExpectation("expectation-1", "run-1", "lease-1", 1, "issue-1",
                                       "team-1", "app-actor-1", 1, sha(before), "", "",
                                       time_ms - 1000, time_ms + 1000)
        marker = marker_for(expectation, key)
        after = before + marker + "\n"
        expectation = EventExpectation("expectation-1", "run-1", "lease-1", 1, "issue-1",
                                       "team-1", "app-actor-1", 1, sha(before), sha(after),
                                       sha(marker), time_ms - 1000, time_ms + 1000)
        db.sqlite.execute("""INSERT INTO test_lease_requests
          (request_id,run_id,node_visit,attempt_id,task_id,candidate_commit,patch_sha256,
           state,created_at,updated_at) VALUES
          ('request-1','run-1',1,'attempt-1','issue-1',?,?,'granted','now','now')""",
                          ("a" * 40, "b" * 64))
        db.sqlite.execute("""INSERT INTO test_leases
          (lease_id,request_id,run_id,attempt_id,task_id,task_key,task_title,team_id,
           stage,state,fence,base_manifest_id,base_traffic_revision,base_json,repository,
           branch,pull_request_number,candidate_commit,patch_sha256,created_at)
          VALUES ('lease-1','request-1','run-1','attempt-1','issue-1','SAC-1','Test',
          'team-1','shared_test_demo','active',1,'manifest-1','traffic-1','{}','owner/repo',
          'codex/test',150,?,?,'now')""", ("a" * 40, "b" * 64))
        db.sqlite.execute("""UPDATE test_environment SET state='active',owner_run_id='run-1',
          owner_lease_id='lease-1',fence=1 WHERE site_id=1""")
        db.sqlite.execute("""INSERT INTO test_expected_events
          (expectation_id,run_id,lease_id,fence,task_id,team_id,kind,action,actor_id,
           key_version,challenge_sha256,before_sha256,after_sha256,marker_sha256,
           valid_from_ms,valid_until_ms,state,created_at)
          VALUES ('expectation-1','run-1','lease-1',1,'issue-1','team-1','Issue','update',
          'app-actor-1',1,?,?,?,?,?,?,'live','now')""",
                          (sha("challenge"), sha(before), sha(after), sha(marker),
                           time_ms - 1000, time_ms + 1000))
        payload = {"type": "Issue", "action": "update", "webhookTimestamp": time_ms,
                   "createdAt": "2026-09-25T04:31:41.029Z",
                   "actor": {"id": "app-actor-1", "type": "user"},
                   "data": {"id": "issue-1", "teamId": "team-1", "team": {"id": "team-1"},
                            "description": after},
                   "updatedFrom": {"description": before}}
        router = SharedTestEventRouter(db, send, key)
        received = datetime.fromtimestamp(time_ms / 1000, UTC)
        payload_hash = sha("exact raw delivery")
        assert await router.route(payload, "delivery-1", time_ms, received, payload_hash)
        assert await router.route(payload, "delivery-1", time_ms, received, payload_hash)
        try:
            await router.route(payload, "delivery-1", time_ms, received, sha("changed delivery"))
        except ValueError as error:
            assert "payload changed" in str(error)
        else:
            raise AssertionError("changed duplicate payload was accepted")
        await router.dispatch("delivery-1")
        assert len(sent) == 1
        assert sent[0]["kind"] == "shared_test_delivery"
        assert db.sqlite.execute("SELECT state FROM test_expected_events").fetchone()[0] == "claimed"
        assert db.sqlite.execute("SELECT COUNT(*) FROM test_provider_deliveries").fetchone()[0] == 1
        assert not await router.route({**payload, "actor": {"id": "human", "type": "user"}},
                                      "delivery-2", time_ms, received, sha("human delivery"))
    finally:
        db.sqlite.close()


def test_exact_provider_event_claims_once_and_dispatches_from_durable_inbox() -> None:
    asyncio.run(_check_exact_provider_event())
