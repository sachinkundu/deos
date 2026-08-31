import hashlib
import hmac
import json
from datetime import UTC, datetime, timedelta

from deos.fakes import FakeQueue, FakeStateStore
from deos.ingress import (
    IngressRouteProof,
    LinearIngress,
    LinearIngressConfig,
    LinearWebhookACL,
    route_event_proof,
)
from deos.ports import DeliveryClassification

SECRET = b"test-secret"
NOW = datetime(2026, 8, 11, 10, 0, tzinfo=UTC)


def make_ingress() -> tuple[LinearIngress, FakeQueue, FakeStateStore]:
    queue = FakeQueue()
    state = FakeStateStore()
    acl = LinearWebhookACL(
        LinearIngressConfig(
            signing_secret=SECRET,
            relevant_project_ids=frozenset({"project-1"}),
            relevant_transitions=frozenset({"Started"}),
        )
    )
    return LinearIngress(acl, state, queue, lambda: NOW), queue, state


def test_relevant_delivery_is_translated_recorded_and_enqueued() -> None:
    ingress, queue, state = make_ingress()
    body = make_body(project_id="project-1", state="Started")

    result = ingress.handle(body, headers(body))

    assert result.status_code == 200
    assert result.classification == DeliveryClassification.RELEVANT
    assert len(queue.events) == 1
    assert queue.events[0].project_id == "project-1"
    assert queue.events[0].transition == "Started"
    assert queue.events[0].actor_type == "user"
    assert queue.events[0].previous_state_id == "previous-state-id"
    assert queue.events[0].label_selection_evidence.status == "available"
    assert [label.name for label in queue.events[0].label_selection_evidence.labels] == [
        "simple-workflow",
        "test",
    ]
    assert len(queue.events[0].label_selection_evidence.digest()) == 64
    assert len(state.deliveries) == 1


def test_irrelevant_delivery_is_recorded_without_enqueue() -> None:
    ingress, queue, state = make_ingress()
    body = make_body(project_id="other-project", state="Started")

    result = ingress.handle(body, headers(body))

    assert result.status_code == 200
    assert result.classification == DeliveryClassification.IRRELEVANT
    assert queue.events == []
    assert len(state.deliveries) == 1


def test_duplicate_delivery_is_acknowledged_without_second_enqueue() -> None:
    ingress, queue, _ = make_ingress()
    body = make_body(project_id="project-1", state="Started")
    signed_headers = headers(body)

    first = ingress.handle(body, signed_headers)
    duplicate = ingress.handle(body, signed_headers)

    assert first.status_code == 200
    assert duplicate.status_code == 200
    assert duplicate.classification == DeliveryClassification.DUPLICATE
    assert len(queue.events) == 1


def test_invalid_signature_and_stale_timestamp_are_rejected() -> None:
    ingress, queue, state = make_ingress()
    body = make_body(project_id="project-1", state="Started")
    invalid = ingress.handle(body, {"Linear-Timestamp": "1786442400", "Linear-Signature": "bad"})
    stale = ingress.handle(body, headers(body, timestamp=NOW - timedelta(minutes=6)))

    assert invalid.status_code == 400
    assert stale.status_code == 400
    assert queue.events == []
    assert state.deliveries == {}


def test_every_state_change_in_configured_project_is_enqueued() -> None:
    ingress, queue, _ = make_ingress()
    body = make_body(project_id="project-1", state="Unexpected Review State")

    result = ingress.handle(body, headers(body))

    assert result.classification == DeliveryClassification.RELEVANT
    assert queue.events[0].transition == "Unexpected Review State"


def test_non_state_issue_update_is_recorded_without_enqueue() -> None:
    ingress, queue, _ = make_ingress()
    body = make_body(project_id="project-1", state="Unexpected Review State", state_changed=False)

    result = ingress.handle(body, headers(body))

    assert result.classification == DeliveryClassification.IRRELEVANT
    assert queue.events == []


def test_missing_or_inconsistent_provider_labels_become_unavailable() -> None:
    ingress, queue, _ = make_ingress()
    missing = make_body(project_id="project-1", state="Started", include_labels=False)
    result = ingress.handle(missing, headers(missing))

    assert result.classification == DeliveryClassification.RELEVANT
    assert queue.events[0].label_selection_evidence.status == "unavailable"


def test_d1_route_proof_admits_enabled_start_and_keeps_active_run_fixed() -> None:
    acl = LinearWebhookACL(
        LinearIngressConfig(
            signing_secret=SECRET,
            relevant_project_ids=frozenset(),
            relevant_transitions=frozenset(),
        )
    )
    start, _ = acl.translate(make_body(project_id="project-1", state="Todo"))
    later, _ = acl.translate(make_body(project_id="project-1", state="Human Review"))
    route = IngressRouteProof("project-1", 3, "a" * 64, "Todo", True)
    frozen = IngressRouteProof("project-1", 2, "b" * 64, "Todo", False)

    assert route_event_proof(start, route) == route
    assert route_event_proof(later, route) is None
    assert route_event_proof(later, route, frozen) == frozen


def test_unknown_and_disabled_routes_have_no_queue_proof() -> None:
    acl = LinearWebhookACL(
        LinearIngressConfig(
            signing_secret=SECRET,
            relevant_project_ids=frozenset(),
            relevant_transitions=frozenset(),
        )
    )
    event, _ = acl.translate(make_body(project_id="project-1", state="Todo"))
    disabled = IngressRouteProof("project-1", 1, "a" * 64, "Todo", False)

    assert route_event_proof(event, None) is None
    assert route_event_proof(event, disabled) is None

    ingress, queue, _ = make_ingress()
    inconsistent = make_body(
        project_id="project-1",
        state="Started",
        labels=[{"id": "label-1", "name": "simple-workflow"}],
        label_ids=["another-label"],
    )
    result = ingress.handle(inconsistent, headers(inconsistent))

    assert result.classification == DeliveryClassification.RELEVANT
    assert queue.events[0].label_selection_evidence.status == "unavailable"


def make_body(
    project_id: str,
    state: str,
    *,
    state_changed: bool = True,
    include_labels: bool = True,
    labels: list[dict[str, str]] | None = None,
    label_ids: list[str] | None = None,
) -> bytes:
    data: dict[str, object] = {
        "id": "issue-1",
        "identifier": "SAC-1",
        "title": "Test issue",
        "url": "https://linear.app/sachinkundu/issue/SAC-1/test-issue",
        "updatedAt": "2026-08-11T10:00:00Z",
        "project": {"id": project_id},
        "state": {"id": "current-state-id", "name": state},
    }
    if include_labels:
        labels = labels or [
            {"id": "label-2", "name": "test"},
            {"id": "label-1", "name": "simple-workflow"},
        ]
        data["labels"] = labels
        data["labelIds"] = label_ids if label_ids is not None else [label["id"] for label in labels]
    return json.dumps(
        {
            "webhookId": "webhook-1",
            "action": "update",
            "type": "Issue",
            "data": data,
            "updatedFrom": {"stateId": "previous-state-id"} if state_changed else {"title": "old"},
            "actor": {"id": "actor-1", "type": "user"},
        },
        separators=(",", ":"),
    ).encode()


def headers(body: bytes, timestamp: datetime | None = None) -> dict[str, str]:
    moment = timestamp or NOW
    timestamp_text = str(int(moment.timestamp() * 1000))
    signed = body
    signature = hmac.new(SECRET, signed, hashlib.sha256).hexdigest()
    return {"Linear-Timestamp": timestamp_text, "Linear-Signature": signature}
