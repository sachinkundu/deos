"""Linear webhook verification, classification, and ACL translation."""

from __future__ import annotations

import hashlib
import hmac
import json
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Mapping

from .ports import (
    ApplicationEvent,
    Delivery,
    DeliveryClassification,
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
            timestamp = datetime.fromtimestamp(int(timestamp_text), tz=timezone.utc)
        except (TypeError, ValueError, OverflowError) as exc:
            raise InvalidWebhook("invalid Linear timestamp") from exc
        if abs(now - timestamp) > self._config.max_timestamp_age:
            raise InvalidWebhook("stale Linear timestamp")

        signed_payload = timestamp_text.encode("ascii") + b"." + body
        expected = hmac.new(self._config.signing_secret, signed_payload, hashlib.sha256).hexdigest()
        supplied = signature.removeprefix("sha256=")
        if not hmac.compare_digest(expected, supplied):
            raise InvalidWebhook("invalid Linear signature")

    def translate(self, body: bytes) -> tuple[ApplicationEvent, bool]:
        try:
            payload: Any = json.loads(body)
        except json.JSONDecodeError as exc:
            raise InvalidWebhook("invalid JSON payload") from exc
        if not isinstance(payload, dict):
            raise InvalidWebhook("payload must be an object")

        data = _object(payload, "data")
        project = _object(data, "project")
        state = _object(data, "state")
        delivery_id = _string(payload, "id")
        issue_id = _string(data, "id")
        project_id = _string(project, "id")
        transition = _first_string(state, "name", "type")
        occurred_at = _parse_datetime(_first_string(payload, "updatedAt", "createdAt"))
        actor = payload.get("actor")
        actor_id = _string(actor, "id") if isinstance(actor, dict) and actor.get("id") else None
        event = ApplicationEvent(
            event_id=delivery_id,
            source_delivery_id=delivery_id,
            issue_id=issue_id,
            project_id=project_id,
            transition=transition,
            actor_id=actor_id,
            occurred_at=occurred_at,
        )
        relevant = (
            project_id in self._config.relevant_project_ids
            and transition in self._config.relevant_transitions
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
            event, relevant = self._acl.translate(body)
        except InvalidWebhook:
            return IngressResult(status_code=400)

        classification = (
            DeliveryClassification.RELEVANT if relevant else DeliveryClassification.IRRELEVANT
        )
        delivery = Delivery.from_body(
            event.source_delivery_id, body, received_at, classification
        )
        if not self._state.record_delivery(delivery):
            return IngressResult(status_code=200, classification=DeliveryClassification.DUPLICATE)
        if not relevant:
            return IngressResult(status_code=200, classification=classification)

        self._queue.enqueue(event)
        return IngressResult(status_code=202, classification=classification, event=event)


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


def _parse_datetime(value: str) -> datetime:
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise InvalidWebhook("invalid event timestamp") from exc
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)
