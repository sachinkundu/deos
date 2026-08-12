"""Dependency boundaries shared by the domain and platform adapters.

The interfaces in this module deliberately know nothing about Cloudflare or
Linear. Provider-specific translation belongs in the anti-corruption layer.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from hashlib import sha256
from typing import Protocol, TypeAlias

TelemetryValue: TypeAlias = str | bool | int | float


class DeliveryClassification(StrEnum):
    RELEVANT = "relevant"
    IRRELEVANT = "irrelevant"
    DUPLICATE = "duplicate"


class WorkflowState(StrEnum):
    RECEIVED = "received"
    QUEUED = "queued"
    REQUIREMENTS_IN_PROGRESS = "requirements_in_progress"
    AWAITING_HUMAN_APPROVAL = "awaiting_human_approval"
    APPROVED = "approved"
    REJECTED = "rejected"


@dataclass(frozen=True, slots=True)
class WorkflowRun:
    run_id: str
    project_id: str
    issue_id: str
    current_state: WorkflowState
    correlation_id: str
    created_at: datetime
    updated_at: datetime


@dataclass(frozen=True, slots=True)
class ApplicationEvent:
    """Canonical event consumed after Linear payload translation."""

    event_id: str
    source_delivery_id: str
    issue_id: str
    project_id: str
    transition: str
    actor_id: str | None
    occurred_at: datetime


@dataclass(frozen=True, slots=True)
class Delivery:
    delivery_id: str
    payload_hash: str
    received_at: datetime
    classification: DeliveryClassification

    @classmethod
    def from_body(
        cls,
        delivery_id: str,
        body: bytes,
        received_at: datetime,
        classification: DeliveryClassification,
    ) -> Delivery:
        return cls(delivery_id, sha256(body).hexdigest(), received_at, classification)


@dataclass(frozen=True, slots=True)
class Transition:
    run_id: str
    previous: WorkflowState
    next: WorkflowState
    cause: str
    actor_id: str | None
    occurred_at: datetime


class IngressPort(Protocol):
    """Accept raw provider input and return a canonical event or classification."""

    def accept(self, body: bytes, headers: Mapping[str, str]) -> ApplicationEvent | None: ...


class QueuePort(Protocol):
    """Durable handoff boundary, implemented by a Cloudflare Queue adapter later."""

    def enqueue(self, event: ApplicationEvent) -> None: ...


class StatePort(Protocol):
    """Workflow and delivery persistence, implemented by a D1 adapter later."""

    def record_delivery(self, delivery: Delivery) -> bool:
        """Return false when the delivery id has already been recorded."""
        ...

    def record_transition(self, transition: Transition) -> None: ...

    def get_run(self, project_id: str, issue_id: str) -> WorkflowRun | None: ...

    def create_run(self, run: WorkflowRun) -> bool:
        """Create a run, returning false when the issue already has one."""
        ...

    def update_run(self, run: WorkflowRun) -> None: ...

    def find_run(self, run_id: str, state: WorkflowState) -> WorkflowRun | None: ...


class TelemetryPort(Protocol):
    """OTEL-compatible event boundary with an explicit cross-system join key."""

    def emit(
        self,
        name: str,
        correlation_id: str,
        attributes: Mapping[str, TelemetryValue],
    ) -> None: ...


class ArtifactStore(Protocol):
    """R2 artifact boundary, kept injectable for deterministic tests."""

    def put(self, key: str, content: bytes, metadata: Mapping[str, str]) -> None: ...


class EventQueue(Protocol):
    """Read-only view useful to deterministic queue fakes and consumers."""

    def items(self) -> Sequence[ApplicationEvent]: ...
