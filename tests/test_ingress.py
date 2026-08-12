import hashlib
import hmac
import json
from datetime import UTC, datetime, timedelta

from deos.fakes import FakeQueue, FakeStateStore, FakeTelemetry
from deos.ingress import LinearIngress, LinearIngressConfig, LinearWebhookACL
from deos.ports import DeliveryClassification

SECRET = b"test-secret"
NOW = datetime(2026, 8, 11, 10, 0, tzinfo=UTC)


def make_ingress() -> tuple[LinearIngress, FakeQueue, FakeStateStore, FakeTelemetry]:
    queue = FakeQueue()
    state = FakeStateStore()
    telemetry = FakeTelemetry()
    acl = LinearWebhookACL(
        LinearIngressConfig(
            signing_secret=SECRET,
            relevant_project_ids=frozenset({"project-1"}),
            relevant_transitions=frozenset({"Started"}),
        )
    )
    return LinearIngress(acl, state, queue, telemetry, lambda: NOW), queue, state, telemetry


def test_relevant_delivery_is_translated_recorded_and_enqueued() -> None:
    ingress, queue, state, telemetry = make_ingress()
    body = make_body(project_id="project-1", state="Started")

    result = ingress.handle(body, headers(body))

    assert result.status_code == 200
    assert result.classification == DeliveryClassification.RELEVANT
    assert len(queue.events) == 1
    assert queue.events[0].project_id == "project-1"
    assert queue.events[0].transition == "Started"
    assert len(state.deliveries) == 1
    assert [event[:2] for event in telemetry.events] == [
        ("deos.queue.published", "webhook-1"),
        ("deos.ingress.accepted", "webhook-1"),
    ]


def test_irrelevant_delivery_is_recorded_without_enqueue() -> None:
    ingress, queue, state, telemetry = make_ingress()
    body = make_body(project_id="other-project", state="Started")

    result = ingress.handle(body, headers(body))

    assert result.status_code == 200
    assert result.classification == DeliveryClassification.IRRELEVANT
    assert queue.events == []
    assert len(state.deliveries) == 1
    assert telemetry.events[0][:2] == ("deos.ingress.ignored", "webhook-1")


def test_duplicate_delivery_is_acknowledged_without_second_enqueue() -> None:
    ingress, queue, _, telemetry = make_ingress()
    body = make_body(project_id="project-1", state="Started")
    signed_headers = headers(body)

    first = ingress.handle(body, signed_headers)
    duplicate = ingress.handle(body, signed_headers)

    assert first.status_code == 200
    assert duplicate.status_code == 200
    assert duplicate.classification == DeliveryClassification.DUPLICATE
    assert len(queue.events) == 1
    assert telemetry.events[-1][:2] == ("deos.ingress.duplicate", "webhook-1")


def test_invalid_signature_and_stale_timestamp_are_rejected() -> None:
    ingress, queue, state, telemetry = make_ingress()
    body = make_body(project_id="project-1", state="Started")
    invalid = ingress.handle(body, {"Linear-Timestamp": "1786442400", "Linear-Signature": "bad"})
    stale = ingress.handle(body, headers(body, timestamp=NOW - timedelta(minutes=6)))

    assert invalid.status_code == 400
    assert stale.status_code == 400
    assert queue.events == []
    assert state.deliveries == {}
    assert [event[0] for event in telemetry.events] == [
        "deos.ingress.rejected",
        "deos.ingress.rejected",
    ]


def make_body(project_id: str, state: str) -> bytes:
    return json.dumps(
        {
            "webhookId": "webhook-1",
            "data": {
                "id": "issue-1",
                "updatedAt": "2026-08-11T10:00:00Z",
                "project": {"id": project_id},
                "state": {"name": state},
            },
            "actor": {"id": "actor-1"},
        },
        separators=(",", ":"),
    ).encode()


def headers(body: bytes, timestamp: datetime | None = None) -> dict[str, str]:
    moment = timestamp or NOW
    timestamp_text = str(int(moment.timestamp() * 1000))
    signed = body
    signature = hmac.new(SECRET, signed, hashlib.sha256).hexdigest()
    return {"Linear-Timestamp": timestamp_text, "Linear-Signature": signature}
