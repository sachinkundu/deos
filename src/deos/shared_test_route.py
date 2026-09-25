"""Durable, one-use test route after the existing raw-body signature check."""

from __future__ import annotations

import hashlib
from datetime import UTC, datetime
from typing import Any, Awaitable, Callable, Mapping

from .shared_test_event import TestExpectation, marker_for, match_test_issue_update


def _value(row: Any, key: str) -> Any:
    return row.get(key) if isinstance(row, dict) else getattr(row, key, None)


def _expectation(row: Any) -> TestExpectation:
    return TestExpectation(
        expectation_id=_value(row, "expectation_id"),
        run_id=_value(row, "run_id"),
        lease_id=_value(row, "lease_id"),
        fence=_value(row, "fence"),
        task_id=_value(row, "task_id"),
        team_id=_value(row, "team_id"),
        actor_id=_value(row, "actor_id"),
        key_version=_value(row, "key_version"),
        before_sha256=_value(row, "before_sha256"),
        after_sha256=_value(row, "after_sha256"),
        marker_sha256=_value(row, "marker_sha256"),
        valid_from_ms=_value(row, "valid_from_ms"),
        valid_until_ms=_value(row, "valid_until_ms"),
    )


class SharedTestEventRouter:
    def __init__(self, db: Any, send: Callable[[object], Awaitable[None]], marker_key: bytes) -> None:
        self.db = db
        self.send = send
        self.marker_key = marker_key

    async def route(
        self, payload: Mapping[str, Any], delivery_id: str, header_timestamp_ms: int,
        received_at: datetime, payload_sha256: str,
    ) -> bool:
        if len(payload_sha256) != 64 or any(c not in "0123456789abcdef" for c in payload_sha256):
            raise ValueError("invalid test delivery payload hash")
        prior = await self.db.prepare(
            "SELECT route,payload_sha256 FROM test_provider_deliveries WHERE delivery_id=?"
        ).bind(delivery_id).first()
        if prior is not None:
            if _value(prior, "payload_sha256") != payload_sha256:
                raise ValueError("test delivery payload changed")
            route = _value(prior, "route")
            if route == "test":
                return True
            return False
        data = payload.get("data")
        if not isinstance(data, dict) or not isinstance(data.get("id"), str):
            return False
        rows = await self.db.prepare(
            """SELECT x.* FROM test_expected_events x JOIN test_environment e
              ON e.owner_lease_id=x.lease_id AND e.owner_run_id=x.run_id
              WHERE x.task_id=? AND x.state='live' AND x.valid_from_ms<=?
                AND x.valid_until_ms>=? AND e.site_id=1 AND e.state='active'
                AND e.fence=x.fence ORDER BY x.created_at LIMIT 2"""
        ).bind(data["id"], header_timestamp_ms, header_timestamp_ms).all()
        candidates = list(_value(rows, "results") or [])
        if len(candidates) > 1:
            raise ValueError("multiple live test expectations for one issue")
        if not candidates:
            return False
        expected = _expectation(candidates[0])
        if not match_test_issue_update(payload, header_timestamp_ms, expected, self.marker_key):
            return False
        marker_hash = hashlib.sha256(marker_for(expected, self.marker_key).encode()).hexdigest()
        timestamp = received_at.astimezone(UTC).isoformat()
        work_id = f"test-delivery:{delivery_id}"
        await self.db.batch([
            self.db.prepare(
                """UPDATE test_expected_events SET state='claimed',claimed_delivery_id=?
                  WHERE expectation_id=? AND state='live' AND run_id=? AND lease_id=?
                    AND fence=? AND EXISTS (SELECT 1 FROM test_environment
                      WHERE site_id=1 AND state='active' AND owner_run_id=?
                        AND owner_lease_id=? AND fence=?)"""
            ).bind(delivery_id, expected.expectation_id, expected.run_id,
                   expected.lease_id, expected.fence, expected.run_id,
                   expected.lease_id, expected.fence),
            self.db.prepare(
                """INSERT OR IGNORE INTO test_provider_deliveries
                  (delivery_id,payload_sha256,provider_time_ms,task_id,team_id,lease_id,run_id,
                   classification,route,expectation_id,marker_audit_sha256,received_at)
                  SELECT ?,?,?,?,?,?,?,'accepted','test',?,?,? WHERE EXISTS
                    (SELECT 1 FROM test_expected_events WHERE expectation_id=?
                      AND state='claimed' AND claimed_delivery_id=?)"""
            ).bind(delivery_id, payload_sha256, header_timestamp_ms, expected.task_id, expected.team_id,
                   expected.lease_id, expected.run_id, expected.expectation_id,
                   marker_hash, timestamp, expected.expectation_id, delivery_id),
            self.db.prepare(
                """INSERT OR IGNORE INTO test_delivery_dispatch
                  (delivery_id,run_id,lease_id,expectation_id,state,queue_work_id,
                   created_at,updated_at)
                  SELECT ?,?,?,?,'pending',?,?,? WHERE EXISTS
                    (SELECT 1 FROM test_provider_deliveries WHERE delivery_id=?
                      AND route='test' AND expectation_id=?)"""
            ).bind(delivery_id, expected.run_id, expected.lease_id,
                   expected.expectation_id, work_id, timestamp, timestamp,
                   delivery_id, expected.expectation_id),
        ])
        saved = await self.db.prepare(
            "SELECT route,expectation_id,payload_sha256 FROM test_provider_deliveries WHERE delivery_id=?"
        ).bind(delivery_id).first()
        if (_value(saved, "route") != "test" or
                _value(saved, "expectation_id") != expected.expectation_id or
                _value(saved, "payload_sha256") != payload_sha256):
            raise ValueError("test delivery route claim was not saved")
        return True

    async def dispatch(self, delivery_id: str) -> None:
        row = await self.db.prepare(
            """SELECT d.delivery_id,d.run_id,d.lease_id,d.expectation_id,d.queue_work_id,
              d.state FROM test_delivery_dispatch d WHERE d.delivery_id=?"""
        ).bind(delivery_id).first()
        if row is None or _value(row, "state") == "done":
            return
        await self.send({
            "kind": "shared_test_delivery",
            "delivery_id": _value(row, "delivery_id"),
            "run_id": _value(row, "run_id"),
            "lease_id": _value(row, "lease_id"),
            "expectation_id": _value(row, "expectation_id"),
            "work_id": _value(row, "queue_work_id"),
        })
        await self.db.prepare(
            """UPDATE test_delivery_dispatch SET send_count=send_count+1,updated_at=?
              WHERE delivery_id=? AND state IN ('pending','claimed')"""
        ).bind(datetime.now(UTC).isoformat(), delivery_id).run()

    async def replay(self, limit: int = 100) -> None:
        rows = await self.db.prepare(
            """SELECT delivery_id FROM test_delivery_dispatch
              WHERE state IN ('pending','claimed') ORDER BY created_at LIMIT ?"""
        ).bind(limit).all()
        for row in list(_value(rows, "results") or []):
            await self.dispatch(_value(row, "delivery_id"))
