import asyncio
import json
import sqlite3
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import pytest

from deos.delivery_handoff import dispatch, replay


class Statement:
    def __init__(self, db: Any, sql: str, values: tuple[Any, ...] = ()) -> None:
        self.db, self.sql, self.values = db, sql, values

    def bind(self, *values: Any) -> "Statement":
        return Statement(self.db, self.sql, values)

    async def run(self) -> dict[str, Any]:
        cursor = self.db.connection.execute(self.sql, self.values)
        return {"meta": {"changes": cursor.rowcount}}

    async def first(self) -> dict[str, Any] | None:
        row = self.db.connection.execute(self.sql, self.values).fetchone()
        return dict(row) if row else None

    async def all(self) -> dict[str, Any]:
        return {"results": [dict(row) for row in self.db.connection.execute(self.sql, self.values)]}


class Database:
    def __init__(self) -> None:
        self.connection = sqlite3.connect(":memory:", isolation_level=None)
        self.connection.row_factory = sqlite3.Row
        self.connection.executescript("CREATE TABLE deliveries(delivery_id TEXT PRIMARY KEY);")
        self.connection.executescript(Path("migrations/0051_delivery_handoffs.sql").read_text())
        self.connection.execute("INSERT INTO deliveries VALUES ('delivery')")
        self.connection.execute(
            """INSERT INTO delivery_handoffs
          (delivery_id,payload_json,created_at) VALUES ('delivery',?,'2026-09-16')""",
            (json.dumps({"source_delivery_id": "delivery", "route_revision": 4}),),
        )

    def prepare(self, sql: str) -> Statement:
        return Statement(self, sql)

    async def batch(self, statements: list[Statement]) -> list[dict[str, Any]]:
        self.connection.execute("BEGIN")
        try:
            result = [await statement.run() for statement in statements]
            self.connection.execute("COMMIT")
            return result
        except BaseException:
            self.connection.execute("ROLLBACK")
            raise


def test_retry_finishes_saved_handoff_and_sent_delivery_is_not_repeated():
    async def exercise() -> None:
        db = Database()
        sent: list[object] = []

        async def send(message: object) -> None:
            sent.append(message)

        # The HTTP request vanished after its transaction. Cron has all context.
        await replay(db, send)
        assert sent == [{"source_delivery_id": "delivery", "route_revision": 4}]
        assert not await dispatch(db, send, "delivery")
        assert len(sent) == 1

    asyncio.run(exercise())


def test_failed_send_preserves_original_diagnostic_and_can_resume():
    async def exercise() -> None:
        db = Database()

        async def failed(_message: object) -> None:
            raise RuntimeError("Queue transport: original failure") from ValueError("socket closed")

        with pytest.raises(RuntimeError, match="original failure"):
            await dispatch(db, failed, "delivery")
        error = db.connection.execute("SELECT diagnostic FROM delivery_handoff_errors").fetchone()[
            0
        ]
        assert "socket closed" in error and "Queue transport: original failure" in error
        delivered: list[object] = []

        async def send(message: object) -> None:
            delivered.append(message)

        await replay(db, send)
        assert len(delivered) == 1
        assert db.connection.execute("SELECT state FROM delivery_handoffs").fetchone()[0] == "sent"

    asyncio.run(exercise())


def test_canceled_or_ambiguous_send_expires_lease_without_changing_delivery_identity():
    async def exercise() -> None:
        db = Database()
        delivered: list[object] = []

        async def canceled(message: object) -> None:
            delivered.append(message)
            raise asyncio.CancelledError()

        before = datetime.now(UTC) - timedelta(minutes=2)
        with pytest.raises(asyncio.CancelledError):
            await dispatch(db, canceled, "delivery", now=before)

        async def send(message: object) -> None:
            delivered.append(message)

        await replay(db, send)
        # At-least-once Queue transport, exactly the same consumer dedup key.
        assert len(delivered) == 2 and delivered[0] == delivered[1]

    asyncio.run(exercise())


def test_concurrent_dispatch_has_one_owner():
    async def exercise() -> None:
        db = Database()
        started, finish = asyncio.Event(), asyncio.Event()
        count = 0

        async def send(_message: object) -> None:
            nonlocal count
            count += 1
            started.set()
            await finish.wait()

        first = asyncio.create_task(dispatch(db, send, "delivery"))
        await started.wait()
        assert not await dispatch(db, send, "delivery")
        finish.set()
        assert await first
        assert count == 1

    asyncio.run(exercise())
