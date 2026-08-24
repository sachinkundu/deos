"""Linear webhook verification, classification, and ACL translation."""

from __future__ import annotations

import hashlib
import hmac
import json
import re
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, cast

from .ports import (
    ApplicationEvent,
    Delivery,
    DeliveryClassification,
    LabelSelectionEvidence,
    LinearLabelIdentity,
    QueuePort,
    StatePort,
)


class InvalidWebhook(ValueError):
    """Raised when a webhook cannot be authenticated or translated."""


@dataclass(frozen=True, slots=True)
class IngressResult:
    status_code: int
    classification: DeliveryClassification | None = None
    event: ApplicationEvent | None = None


@dataclass(frozen=True, slots=True)
class LinearIngressConfig:
    signing_secret: bytes
    relevant_project_ids: frozenset[str]
    relevant_transitions: frozenset[str]
    max_timestamp_age: timedelta = timedelta(minutes=5)


class LinearWebhookACL:
    """Translate a verified Linear payload into the application event model."""

    def __init__(self, config: LinearIngressConfig) -> None:
        self._config = config

    def verify(self, body: bytes, headers: Mapping[str, str], now: datetime) -> None:
        timestamp_text = _header(headers, "linear-timestamp")
        signature = _header(headers, "linear-signature")
        if timestamp_text is None or signature is None:
            raise InvalidWebhook("missing Linear signature headers")
        try:
            timestamp_ms = int(timestamp_text)
        except (TypeError, ValueError, OverflowError) as exc:
            raise InvalidWebhook("invalid Linear timestamp") from exc
        timestamp = datetime.fromtimestamp(timestamp_ms / 1000, tz=UTC)
        if abs(now - timestamp) > self._config.max_timestamp_age:
            raise InvalidWebhook("stale Linear timestamp")

        expected = hmac.new(self._config.signing_secret, body, hashlib.sha256).hexdigest()
        supplied = signature.removeprefix("sha256=")
        if not hmac.compare_digest(expected, supplied):
            raise InvalidWebhook("invalid Linear signature")

    def translate(
        self, body: bytes, delivery_id: str | None = None
    ) -> tuple[ApplicationEvent, bool]:
        try:
            payload: Any = json.loads(body)
        except json.JSONDecodeError as exc:
            raise InvalidWebhook("invalid JSON payload") from exc
        if not isinstance(payload, dict):
            raise InvalidWebhook("payload must be an object")

        data = _object(payload, "data")
        project = _object(data, "project")
        state = _object(data, "state")
        action = _optional_string(payload, "action") or "update"
        resource_type = _optional_string(payload, "type") or "Issue"
        if resource_type != "Issue":
            raise InvalidWebhook("webhook resource must be Issue")
        delivery_id = delivery_id or _first_string(payload, "webhookId", "id")
        issue_id = _string(data, "id")
        issue_key = _optional_string(data, "identifier")
        issue_title = _optional_string(data, "title")
        issue_url = _optional_string(data, "url")
        if issue_key is None or re.fullmatch(r"[A-Z][A-Z0-9]+-[1-9][0-9]*", issue_key) is None:
            raise InvalidWebhook("invalid Linear issue identifier")
        if issue_title is None or not issue_title.strip() or len(issue_title) > 300:
            raise InvalidWebhook("invalid Linear issue title")
        if (
            issue_url is None
            or not issue_url.startswith("https://linear.app/")
            or f"/issue/{issue_key}/" not in issue_url
        ):
            raise InvalidWebhook("invalid Linear issue URL")
        project_id = _string(project, "id")
        transition = _first_string(state, "name", "type")
        occurred_at = _parse_datetime(
            _first_string(data, "updatedAt", "createdAt")
            if isinstance(data, dict)
            else _first_string(payload, "updatedAt", "createdAt")
        )
        actor = payload.get("actor")
        actor_id = _string(actor, "id") if isinstance(actor, dict) and actor.get("id") else None
        actor_type = _optional_string(actor, "type") if isinstance(actor, dict) else None
        updated_from = payload.get("updatedFrom")
        previous_state_id, previous_state_name = _previous_state(updated_from)
        state_id = _optional_string(state, "id")
        label_selection_evidence = _label_selection_evidence(data)
        event = ApplicationEvent(
            event_id=delivery_id,
            source_delivery_id=delivery_id,
            issue_id=issue_id,
            project_id=project_id,
            transition=transition,
            actor_id=actor_id,
            occurred_at=occurred_at,
            actor_type=actor_type.lower() if actor_type is not None else None,
            event_kind=f"{resource_type}.{action}",
            state_id=state_id,
            previous_state_id=previous_state_id,
            previous_state_name=previous_state_name,
            issue_key=issue_key,
            issue_title=issue_title.strip(),
            issue_url=issue_url,
            label_selection_evidence=label_selection_evidence,
        )
        state_changed = isinstance(updated_from, dict) and (
            "stateId" in updated_from or "state" in updated_from
        )
        relevant = project_id in self._config.relevant_project_ids and (
            state_changed or transition in self._config.relevant_transitions
        )
        return event, relevant


class LinearIngress:
    """HTTP-facing application service with idempotent delivery recording."""

    def __init__(
        self,
        acl: LinearWebhookACL,
        state: StatePort,
        queue: QueuePort,
        now: Callable[[], datetime],
    ) -> None:
        self._acl = acl
        self._state = state
        self._queue = queue
        self._now = now

    def handle(self, body: bytes, headers: Mapping[str, str]) -> IngressResult:
        received_at = self._now()
        try:
            self._acl.verify(body, headers, received_at)
            event, relevant = self._acl.translate(body, _header(headers, "linear-delivery"))
        except InvalidWebhook:
            return IngressResult(status_code=400)

        classification = (
            DeliveryClassification.RELEVANT if relevant else DeliveryClassification.IRRELEVANT
        )
        delivery = Delivery.from_body(event.source_delivery_id, body, received_at, classification)
        if not self._state.record_delivery(delivery):
            return IngressResult(status_code=200, classification=DeliveryClassification.DUPLICATE)
        if not relevant:
            return IngressResult(status_code=200, classification=classification)

        self._queue.enqueue(event)
        return IngressResult(status_code=200, classification=classification, event=event)


def _header(headers: Mapping[str, str], name: str) -> str | None:
    lowered = name.lower()
    for key, value in headers.items():
        if key.lower() == lowered:
            return value
    return None


def _object(value: Any, key: str) -> dict[str, Any]:
    nested = value.get(key) if isinstance(value, dict) else None
    if not isinstance(nested, dict):
        raise InvalidWebhook(f"missing object field: {key}")
    return nested


def _string(value: Any, key: str) -> str:
    result = value.get(key) if isinstance(value, dict) else None
    if not isinstance(result, str) or not result:
        raise InvalidWebhook(f"missing string field: {key}")
    return result


def _first_string(value: Any, *keys: str) -> str:
    for key in keys:
        candidate = value.get(key) if isinstance(value, dict) else None
        if isinstance(candidate, str) and candidate:
            return candidate
    raise InvalidWebhook(f"missing string fields: {', '.join(keys)}")


def _optional_string(value: Any, key: str) -> str | None:
    result = value.get(key) if isinstance(value, dict) else None
    return result if isinstance(result, str) and result else None


def _previous_state(value: Any) -> tuple[str | None, str | None]:
    if not isinstance(value, dict):
        return None, None
    state_id = _optional_string(value, "stateId")
    previous = value.get("state")
    if isinstance(previous, str) and previous:
        return state_id, previous
    if isinstance(previous, dict):
        return state_id or _optional_string(previous, "id"), _optional_string(previous, "name")
    return state_id, None


def _label_selection_evidence(data: dict[str, Any]) -> LabelSelectionEvidence:
    raw_labels: object = data.get("labels")
    raw_label_ids: object = data.get("labelIds")
    if not isinstance(raw_labels, list) or not isinstance(raw_label_ids, list):
        return LabelSelectionEvidence("unavailable")
    labels = cast(list[object], raw_labels)
    label_ids = cast(list[object], raw_label_ids)
    normalized_label_ids: list[str] = []
    for label_id in label_ids:
        if not isinstance(label_id, str) or not label_id:
            return LabelSelectionEvidence("unavailable")
        normalized_label_ids.append(label_id)

    identities: list[LinearLabelIdentity] = []
    for raw_label in labels:
        if not isinstance(raw_label, dict):
            return LabelSelectionEvidence("unavailable")
        label = cast(dict[str, object], raw_label)
        label_id = label.get("id")
        name = label.get("name")
        if (
            not isinstance(label_id, str)
            or not label_id
            or not isinstance(name, str)
            or not name.strip()
            or len(name) > 255
        ):
            return LabelSelectionEvidence("unavailable")
        identities.append(LinearLabelIdentity(id=label_id, name=name.strip()))

    if len({identity.id for identity in identities}) != len(identities):
        return LabelSelectionEvidence("unavailable")
    if sorted(normalized_label_ids) != sorted(identity.id for identity in identities):
        return LabelSelectionEvidence("unavailable")
    identities.sort(key=lambda identity: identity.id)
    return LabelSelectionEvidence("available", tuple(identities))


def _parse_datetime(value: str) -> datetime:
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError as exc:
        raise InvalidWebhook("invalid event timestamp") from exc
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)
