"""Deterministic in-memory adapters for unit tests and local development."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Mapping

from .ports import ApplicationEvent, Delivery, EventQueue, Transition


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

    def record_delivery(self, delivery: Delivery) -> bool:
        if delivery.delivery_id in self.deliveries:
            return False
        self.deliveries[delivery.delivery_id] = delivery
        return True

    def record_transition(self, transition: Transition) -> None:
        self.transitions.append(transition)


@dataclass
class FakeTelemetry:
    events: list[tuple[str, dict[str, str]]] = field(default_factory=list)

    def emit(self, name: str, attributes: Mapping[str, str]) -> None:
        self.events.append((name, dict(attributes)))


@dataclass
class FakeArtifactStore:
    objects: dict[str, tuple[bytes, dict[str, str]]] = field(default_factory=dict)

    def put(self, key: str, content: bytes, metadata: Mapping[str, str]) -> None:
        self.objects[key] = (content, dict(metadata))
