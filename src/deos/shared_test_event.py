"""Exact matcher for a signed Linear Issue update after webhook verification."""

from __future__ import annotations

import hashlib
import hmac
import json
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Mapping


@dataclass(frozen=True, slots=True)
class TestExpectation:
    expectation_id: str
    run_id: str
    lease_id: str
    fence: int
    task_id: str
    team_id: str
    actor_id: str
    key_version: int
    before_sha256: str
    after_sha256: str
    marker_sha256: str
    valid_from_ms: int
    valid_until_ms: int


def marker_for(expectation: TestExpectation, key: bytes) -> str:
    if expectation.key_version != 1 or not key:
        raise ValueError("unknown test marker key version")
    subject = json.dumps(
        [
            1,
            expectation.expectation_id,
            expectation.run_id,
            expectation.lease_id,
            expectation.task_id,
            expectation.fence,
        ],
        separators=(",", ":"),
    ).encode()
    mac = hmac.new(key, subject, hashlib.sha256).hexdigest()
    return f"<!-- deos-test-v1:{expectation.expectation_id}:{mac} -->"


def _sha(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def _description(value: Any) -> str | None:
    if value is None:
        return ""
    return value if isinstance(value, str) else None


def match_test_issue_update(
    payload: Mapping[str, Any], header_timestamp_ms: int, expectation: TestExpectation, key: bytes
) -> bool:
    """A marker has no routing power without every saved provider fact."""
    if payload.get("type") != "Issue" or payload.get("action") != "update":
        return False
    if (
        not isinstance(header_timestamp_ms, int)
        or isinstance(header_timestamp_ms, bool)
        or payload.get("webhookTimestamp") != header_timestamp_ms
        or not expectation.valid_from_ms <= header_timestamp_ms <= expectation.valid_until_ms
    ):
        return False
    created_at = payload.get("createdAt")
    if not isinstance(created_at, str):
        return False
    try:
        event_time = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
    except ValueError:
        return False
    if event_time.tzinfo is None or abs(int(event_time.timestamp() * 1000) - header_timestamp_ms) > 60_000:
        return False
    data = payload.get("data")
    actor = payload.get("actor")
    changed = payload.get("updatedFrom")
    if not isinstance(data, dict) or not isinstance(actor, dict) or not isinstance(changed, dict):
        return False
    team = data.get("team")
    if (
        data.get("id") != expectation.task_id
        or data.get("teamId") != expectation.team_id
        or not isinstance(team, dict)
        or team.get("id") != expectation.team_id
        or actor.get("id") != expectation.actor_id
        or actor.get("type") != "user"
    ):
        return False
    # Linear omitted updatedFrom.description when the old value was null in
    # the real provider canary. That case is safe only for a saved empty hash.
    before = _description(changed.get("description"))
    if "description" not in changed and expectation.before_sha256 != _sha(""):
        return False
    after = _description(data.get("description"))
    if before is None or after is None or before == after:
        return False
    marker = marker_for(expectation, key)
    if (
        _sha(marker) != expectation.marker_sha256
        or _sha(before) != expectation.before_sha256
        or _sha(after) != expectation.after_sha256
        or marker in before
        or after.split("\n").count(marker) != 1
    ):
        return False
    return True
