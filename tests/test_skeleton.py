from datetime import UTC, datetime

from deos.fakes import FakeArtifactStore, FakeQueue, FakeStateStore, FakeTelemetry
from deos.ports import (
    ApplicationEvent,
    Delivery,
    DeliveryClassification,
    Transition,
    WorkflowState,
)


def test_fake_adapters_preserve_domain_values() -> None:
    occurred_at = datetime(2026, 8, 11, 10, 0, tzinfo=UTC)
    event = ApplicationEvent(
        event_id="evt-1",
        source_delivery_id="delivery-1",
        issue_id="issue-1",
        project_id="project-1",
        transition="started",
        actor_id="actor-1",
        occurred_at=occurred_at,
    )
    queue = FakeQueue()
    queue.enqueue(event)

    state = FakeStateStore()
    delivery = Delivery.from_body(
        "delivery-1", b"payload", occurred_at, DeliveryClassification.RELEVANT
    )
    assert state.record_delivery(delivery) is True
    assert state.record_delivery(delivery) is False
    transition = Transition(
        "run-1",
        WorkflowState.RECEIVED,
        WorkflowState.QUEUED,
        "accepted",
        "actor-1",
        occurred_at,
    )
    state.record_transition(transition)

    telemetry = FakeTelemetry()
    telemetry.emit("delivery.accepted", "delivery-1", {"delivery_id": "delivery-1"})
    artifacts = FakeArtifactStore()
    artifacts.put("runs/run-1/proposal.md", b"proposal", {"content_type": "text/markdown"})

    assert queue.items() == [event]
    assert list(state.deliveries) == ["delivery-1"]
    assert state.transitions == [transition]
    assert telemetry.events == [("delivery.accepted", "delivery-1", {"delivery_id": "delivery-1"})]
    assert artifacts.objects["runs/run-1/proposal.md"][0] == b"proposal"
