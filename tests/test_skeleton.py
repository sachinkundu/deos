from datetime import UTC, datetime
import unittest

from deos.fakes import FakeArtifactStore, FakeQueue, FakeStateStore, FakeTelemetry
from deos.ports import (
    ApplicationEvent,
    Delivery,
    DeliveryClassification,
    Transition,
    WorkflowState,
)


class SkeletonTests(unittest.TestCase):
    def test_fake_adapters_preserve_domain_values(self) -> None:
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
        self.assertTrue(state.record_delivery(delivery))
        self.assertFalse(state.record_delivery(delivery))
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
        telemetry.emit("delivery.accepted", {"delivery_id": "delivery-1"})
        artifacts = FakeArtifactStore()
        artifacts.put("runs/run-1/proposal.md", b"proposal", {"content_type": "text/markdown"})

        self.assertEqual(queue.items(), [event])
        self.assertEqual(list(state.deliveries), ["delivery-1"])
        self.assertEqual(state.transitions, [transition])
        self.assertEqual(telemetry.events, [("delivery.accepted", {"delivery_id": "delivery-1"})])
        self.assertEqual(artifacts.objects["runs/run-1/proposal.md"][0], b"proposal")
