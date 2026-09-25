"""Local matcher checks; provider proof remains in sac-253-linear-contract.json."""

from __future__ import annotations

import hashlib
from dataclasses import replace

from deos.shared_test_event import TestExpectation as EventExpectation
from deos.shared_test_event import marker_for, match_test_issue_update


def sha(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def test_exact_signed_event_facts_match_without_a_project() -> None:
    key = b"test-marker-key"
    time_ms = 1790310701176
    base = EventExpectation(
        expectation_id="expectation-1",
        run_id="run-1",
        lease_id="lease-1",
        fence=3,
        task_id="issue-1",
        team_id="team-1",
        actor_id="app-actor-1",
        key_version=1,
        before_sha256=sha("Task description\n"),
        after_sha256="",
        marker_sha256="",
        valid_from_ms=time_ms - 1000,
        valid_until_ms=time_ms + 1000,
    )
    marker = marker_for(base, key)
    expected = replace(base, after_sha256=sha(f"Task description\n{marker}\n"),
                       marker_sha256=sha(marker))
    event = {
        "type": "Issue",
        "action": "update",
        "webhookTimestamp": time_ms,
        "createdAt": "2026-09-25T04:31:41.029Z",
        "actor": {"id": "app-actor-1", "type": "user"},
        "data": {"id": "issue-1", "teamId": "team-1", "team": {"id": "team-1"},
                 "description": f"Task description\n{marker}\n"},
        "updatedFrom": {"description": "Task description\n", "updatedAt": "prior"},
    }
    assert match_test_issue_update(event, time_ms, expected, key)
    assert match_test_issue_update({**event, "data": {**event["data"], "projectId": None}},
                                   time_ms, expected, key)
    assert not match_test_issue_update(event, time_ms + 1, expected, key)
    assert not match_test_issue_update({**event, "actor": {"id": "human", "type": "user"}},
                                       time_ms, expected, key)
    assert not match_test_issue_update({**event, "data": {**event["data"], "teamId": "other"}},
                                       time_ms, expected, key)
    assert not match_test_issue_update({**event, "updatedFrom": {"description": "other"}},
                                       time_ms, expected, key)
    assert not match_test_issue_update(event, time_ms, expected, b"wrong-key")


def test_null_prior_description_can_be_omitted_only_for_the_empty_saved_hash() -> None:
    key = b"test-marker-key"
    time_ms = 1790310701176
    expectation = EventExpectation("expectation-1", "run-1", "lease-1", 3, "issue-1", "team-1",
                                  "app-actor-1", 1, sha(""), "", "", time_ms - 1000,
                                  time_ms + 1000)
    marker = marker_for(expectation, key)
    expectation = EventExpectation(
        expectation.expectation_id, expectation.run_id, expectation.lease_id,
        expectation.fence, expectation.task_id, expectation.team_id, expectation.actor_id,
        1, sha(""), sha(marker + "\n"), sha(marker), time_ms - 1000, time_ms + 1000,
    )
    event = {"type": "Issue", "action": "update", "webhookTimestamp": time_ms,
             "createdAt": "2026-09-25T04:31:41.029Z",
             "actor": {"id": "app-actor-1", "type": "user"},
             "data": {"id": "issue-1", "teamId": "team-1", "team": {"id": "team-1"},
                      "description": marker + "\n"}, "updatedFrom": {"updatedAt": "prior"}}
    assert match_test_issue_update(event, time_ms, expectation, key)
