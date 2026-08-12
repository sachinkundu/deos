"""Deterministic in-memory adapters for unit tests and local development."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field

from .ports import (
    ApplicationEvent,
    Delivery,
    EventQueue,
    TelemetryValue,
    Transition,
    WorkflowRun,
    WorkflowState,
)


@dataclass
class FakeQueue(EventQueue):
    events: list[ApplicationEvent] = field(default_factory=list)

    def enqueue(self, event: ApplicationEvent) -> None:
        self.events.append(event)

    def items(self) -> list[ApplicationEvent]:
        return list(self.events)


@dataclass
class FakeStateStore:
    deliveries: dict[str, Delivery] = field(default_factory=dict)
    transitions: list[Transition] = field(default_factory=list)
    runs: dict[str, WorkflowRun] = field(default_factory=dict)

    def record_delivery(self, delivery: Delivery) -> bool:
        if delivery.delivery_id in self.deliveries:
            return False
        self.deliveries[delivery.delivery_id] = delivery
        return True

    def record_transition(self, transition: Transition) -> None:
        self.transitions.append(transition)

    def get_run(self, project_id: str, issue_id: str) -> WorkflowRun | None:
        return next(
            (
                run
                for run in self.runs.values()
                if run.project_id == project_id and run.issue_id == issue_id
            ),
            None,
        )

    def find_run(self, run_id: str, state: WorkflowState) -> WorkflowRun | None:
        run = self.runs.get(run_id)
        return run if run is not None and run.current_state == state else None

    def create_run(self, run: WorkflowRun) -> bool:
        if self.get_run(run.project_id, run.issue_id) is not None:
            return False
        self.runs[run.run_id] = run
        return True

    def update_run(self, run: WorkflowRun) -> None:
        self.runs[run.run_id] = run


@dataclass
class FakeTelemetry:
    events: list[tuple[str, str, dict[str, TelemetryValue]]] = field(default_factory=list)

    def emit(
        self,
        name: str,
        correlation_id: str,
        attributes: Mapping[str, TelemetryValue],
    ) -> None:
        self.events.append((name, correlation_id, dict(attributes)))


@dataclass
class FakeArtifactStore:
    objects: dict[str, tuple[bytes, dict[str, str]]] = field(default_factory=dict)

    def put(self, key: str, content: bytes, metadata: Mapping[str, str]) -> None:
        self.objects[key] = (content, dict(metadata))
