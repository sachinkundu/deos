"""Durable Queue outbox; cancellation or an ambiguous send remains replayable."""

from __future__ import annotations

import json
import traceback
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, timedelta
from typing import Any, cast
from uuid import uuid4


def row_value(row: Any, key: str) -> Any:
    return cast(dict[str, Any], row).get(key) if isinstance(row, dict) else getattr(row, key, None)


async def dispatch(
    database: Any,
    send: Callable[[object], Awaitable[None]],
    delivery_id: str,
    *,
    now: datetime | None = None,
) -> bool:
    moment = now or datetime.now(UTC)
    lease = str(uuid4())
    claimed = (
        await database.prepare("""UPDATE delivery_handoffs
      SET lease_id=?,lease_until=?,attempts=attempts+1
      WHERE delivery_id=? AND state='pending' AND (lease_until IS NULL OR lease_until<=?)""")
        .bind(lease, (moment + timedelta(minutes=1)).isoformat(), delivery_id, moment.isoformat())
        .run()
    )
    if row_value(row_value(claimed, "meta"), "changes") != 1:
        return False
    row = (
        await database.prepare(
            "SELECT payload_json FROM delivery_handoffs WHERE delivery_id=? AND lease_id=?"
        )
        .bind(delivery_id, lease)
        .first()
    )
    try:
        await send(json.loads(row_value(row, "payload_json")))
        await (
            database.prepare("""UPDATE delivery_handoffs SET state='sent',sent_at=?,
          lease_id=NULL,lease_until=NULL WHERE delivery_id=? AND lease_id=?""")
            .bind(datetime.now(UTC).isoformat(), delivery_id, lease)
            .run()
        )
    except Exception as error:
        # Preserve the original cause before releasing for another dispatch.
        # Cancellation leaves the lease to expire, covering process termination.
        diagnostic = "".join(traceback.format_exception(error))
        try:
            await database.batch(
                [
                    database.prepare("INSERT INTO delivery_handoff_errors VALUES (?,?,?,?)").bind(
                        str(uuid4()), delivery_id, datetime.now(UTC).isoformat(), diagnostic
                    ),
                    database.prepare("""UPDATE delivery_handoffs SET lease_id=NULL,lease_until=NULL
                  WHERE delivery_id=? AND lease_id=?""").bind(delivery_id, lease),
                ]
            )
        except Exception as secondary:  # noqa: BLE001 - both original errors are re-raised
            raise ExceptionGroup("Queue send and diagnostic storage failed", [error, secondary])
        raise
    return True


async def replay(database: Any, send: Callable[[object], Awaitable[None]]) -> None:
    rows = (
        await database.prepare("""SELECT delivery_id FROM delivery_handoffs
      WHERE state='pending' AND (lease_until IS NULL OR lease_until<=?)
      ORDER BY created_at LIMIT 25""")
        .bind(datetime.now(UTC).isoformat())
        .all()
    )
    failures: list[Exception] = []
    for row in row_value(rows, "results"):
        try:
            await dispatch(database, send, row_value(row, "delivery_id"))
        except Exception as error:  # noqa: BLE001 - replay other deliveries, then re-raise all
            failures.append(error)
    if failures:
        raise ExceptionGroup("Pending Queue handoffs failed", failures)
