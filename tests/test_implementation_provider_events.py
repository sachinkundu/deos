"""Exercise ingress selection and duplicate handling with SQLite."""

import asyncio
import importlib.util
import sqlite3
import sys
from datetime import UTC, datetime
from pathlib import Path
from types import ModuleType, SimpleNamespace


def load_entry(monkeypatch):
    workers = ModuleType("workers")
    workers.Response = object
    workers.WorkerEntrypoint = object
    telemetry = ModuleType("worker_telemetry")
    telemetry.emit_observation = lambda _event: None
    ffi = ModuleType("pyodide.ffi")
    ffi.jsnull = None
    monkeypatch.setitem(sys.modules, "workers", workers)
    monkeypatch.setitem(sys.modules, "worker_telemetry", telemetry)
    monkeypatch.setitem(sys.modules, "pyodide", ModuleType("pyodide"))
    monkeypatch.setitem(sys.modules, "pyodide.ffi", ffi)
    spec = importlib.util.spec_from_file_location("entry_provider_test", "src/entry.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class Statement:
    def __init__(self, database, sql, values=()):
        self.database, self.sql, self.values = database, sql, values

    def bind(self, *values):
        return Statement(self.database, self.sql, values)

    async def run(self):
        self.database.execute(self.sql, self.values)


class Database:
    def __init__(self):
        self.connection = sqlite3.connect(":memory:")
        for path in sorted(Path("migrations").glob("*.sql")):
            self.connection.executescript(path.read_text())

    def prepare(self, sql):
        return Statement(self.connection, sql)


def test_only_scoped_issue_state_deliveries_enter_provider_proof(monkeypatch):
    module, database = load_entry(monkeypatch), Database()
    try:
        database.connection.execute(
            """INSERT INTO implementation_resources
            (resource_id,run_id,attempt_id,kind,slot_id,allocation_op,provider,
             provider_resource_id,status,created_at,updated_at)
            VALUES ('resource','run','attempt','safe_test','slot','allocation',
                    'github-linear-review-v1','test-issue','ready','now','now')"""
        )
        delivery = SimpleNamespace(delivery_id="delivery", payload_hash="a" * 64, received_at=datetime.now(UTC))
        event = SimpleNamespace(event_kind="Issue.update", actor_id="app", state_id="work",
                                previous_state_id="review", occurred_at=datetime.now(UTC), issue_id="real-issue")
        asyncio.run(module._record_implementation_test_event(database, event, delivery))
        assert database.connection.execute("SELECT COUNT(*) FROM implementation_test_events").fetchone()[0] == 0
        event.issue_id = "test-issue"
        asyncio.run(module._record_implementation_test_event(database, event, delivery))
        asyncio.run(module._record_implementation_test_event(database, event, delivery))
        row = database.connection.execute("SELECT delivery_id,issue_id,actor_id,from_state_id,to_state_id,payload_sha FROM implementation_test_events").fetchone()
        assert row == ("delivery", "test-issue", "app", "review", "work", "a" * 64)
        assert database.connection.execute("SELECT COUNT(*) FROM implementation_test_events").fetchone()[0] == 1
        event.event_kind = "Comment.create"
        delivery.delivery_id = "comment"
        asyncio.run(module._record_implementation_test_event(database, event, delivery))
        assert database.connection.execute("SELECT COUNT(*) FROM implementation_test_events").fetchone()[0] == 1
    finally:
        database.connection.close()
