"""Closed workflow-observation contract shared by platform adapters."""

from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime
from typing import TypeAlias

ObservationValue: TypeAlias = str | int
Observation: TypeAlias = dict[str, ObservationValue]

SCHEMA_VERSION = "1"
STAGES = frozenset(
    {
        "ingress.delivery_record",
        "queue.publish",
        "queue.consume",
        "workflow.transition",
        "linear.issue_update",
    }
)
OUTCOMES = frozenset({"started", "succeeded", "failed", "duplicate"})
ERROR_TYPES = frozenset(
    {
        "correlation_mismatch",
        "d1_operation_failed",
        "queue_publish_failed",
        "linear_transport_failed",
        "linear_http_failed",
        "linear_graphql_failed",
        "unexpected_failure",
    }
)


def workflow_identity(project_id: str, issue_id: str) -> str:
    """Return the canonical run and correlation identifier."""
    if not project_id or not issue_id:
        raise ValueError("project and issue identifiers are required")
    return f"workflow:{project_id}:{issue_id}"


def build_observation(
    *,
    service_name: str,
    stage: str,
    outcome: str,
    correlation_id: str,
    delivery_id: str,
    issue_id: str,
    project_id: str,
    run_id: str,
    error_type: str | None = None,
    message_id: str | None = None,
    attempt_number: int | None = None,
    previous_state: str | None = None,
    next_state: str | None = None,
    cause: str | None = None,
    now: Callable[[], datetime] = lambda: datetime.now(UTC),
) -> Observation:
    """Construct an indexed observation from service-owned, allowlisted values."""
    required_values = {
        "service_name": service_name,
        "correlation_id": correlation_id,
        "delivery_id": delivery_id,
        "issue_id": issue_id,
        "project_id": project_id,
        "run_id": run_id,
    }
    if missing := [name for name, value in required_values.items() if not value]:
        raise ValueError(f"required observation values are empty: {', '.join(missing)}")
    if stage not in STAGES:
        raise ValueError(f"unsupported workflow stage: {stage}")
    if outcome not in OUTCOMES:
        raise ValueError(f"unsupported workflow outcome: {outcome}")
    if outcome == "failed" and error_type not in ERROR_TYPES:
        raise ValueError("failed observations require a supported error type")
    if outcome != "failed" and error_type is not None:
        raise ValueError("error type is allowed only for failed observations")
    if (message_id is None) != (attempt_number is None):
        raise ValueError("Queue message id and attempt number must be supplied together")
    if attempt_number is not None and attempt_number < 1:
        raise ValueError("Queue attempt number starts at 1")

    observation: Observation = {
        "event.time": now().astimezone(UTC).isoformat().replace("+00:00", "Z"),
        "event.name": f"deos.workflow.{stage}",
        "service.name": service_name,
        "deos.telemetry.schema_version": SCHEMA_VERSION,
        "deos.workflow.correlation_id": correlation_id,
        "deos.workflow.stage": stage,
        "deos.workflow.outcome": outcome,
        "linear.delivery.id": delivery_id,
        "linear.issue.id": issue_id,
        "linear.project.id": project_id,
        "deos.workflow.run_id": run_id,
    }
    optional_values: dict[str, ObservationValue | None] = {
        "error.type": error_type,
        "messaging.message.id": message_id,
        "deos.workflow.attempt.number": attempt_number,
        "deos.workflow.previous_state": previous_state,
        "deos.workflow.next_state": next_state,
        "deos.workflow.cause": cause,
    }
    observation.update({key: value for key, value in optional_values.items() if value is not None})
    return observation
