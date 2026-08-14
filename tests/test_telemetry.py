import json
from datetime import UTC, datetime
from pathlib import Path

import pytest

from deos.telemetry import (
    ERROR_TYPES,
    OUTCOMES,
    SCHEMA_VERSION,
    STAGES,
    build_observation,
    workflow_identity,
)

FIXTURE = json.loads(
    (Path(__file__).parent / "fixtures" / "workflow-observation-schema.json").read_text()
)
NOW = datetime(2026, 8, 14, 5, 0, tzinfo=UTC)


def observation(**overrides: object) -> dict[str, str | int]:
    values: dict[str, object] = {
        "service_name": "deos-sample-project",
        "stage": "queue.publish",
        "outcome": "succeeded",
        "correlation_id": "workflow:project-1:issue-1",
        "delivery_id": "delivery-1",
        "issue_id": "issue-1",
        "project_id": "project-1",
        "run_id": "workflow:project-1:issue-1",
        "now": lambda: NOW,
    }
    values.update(overrides)
    return build_observation(**values)  # type: ignore[arg-type]


def test_python_contract_matches_shared_schema_fixture() -> None:
    result = observation()

    assert FIXTURE["schema_version"] == SCHEMA_VERSION
    assert set(FIXTURE["required_keys"]) == set(result)
    assert set(FIXTURE["stages"]) == STAGES
    assert set(FIXTURE["outcomes"]) == OUTCOMES
    assert set(FIXTURE["error_types"]) == ERROR_TYPES
    assert result["event.time"] == "2026-08-14T05:00:00Z"


def test_correlation_is_stable_for_the_same_project_and_issue() -> None:
    assert workflow_identity("project-1", "issue-1") == "workflow:project-1:issue-1"
    assert workflow_identity("project-1", "issue-1") == workflow_identity(
        "project-1", "issue-1"
    )


def test_failed_observation_accepts_only_service_authored_error_category() -> None:
    result = observation(outcome="failed", error_type="linear_http_failed")
    assert result["error.type"] == "linear_http_failed"

    with pytest.raises(ValueError, match="supported error type"):
        observation(outcome="failed", error_type="provider said token=secret")


def test_observation_has_no_sensitive_or_provider_content_fields() -> None:
    result = observation()

    assert set(FIXTURE["forbidden_keys"]).isdisjoint(result)
    serialized = json.dumps(result).lower()
    for forbidden_value in ("authorization", "webhook_secret", "api_token", "request.body"):
        assert forbidden_value not in serialized


def test_queue_attempt_metadata_is_paired_and_starts_at_one() -> None:
    result = observation(message_id="message-1", attempt_number=2)
    assert result["messaging.message.id"] == "message-1"
    assert result["deos.workflow.attempt.number"] == 2

    with pytest.raises(ValueError, match="supplied together"):
        observation(message_id="message-1")
    with pytest.raises(ValueError, match="starts at 1"):
        observation(message_id="message-1", attempt_number=0)
