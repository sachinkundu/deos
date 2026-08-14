"""Cloudflare Python Worker entrypoint for the Linear webhook."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from workers import Response, WorkerEntrypoint

from deos.ingress import InvalidWebhook, LinearIngressConfig, LinearWebhookACL
from deos.ports import ApplicationEvent, Delivery, DeliveryClassification
from deos.telemetry import Observation, build_observation, workflow_identity
from worker_telemetry import emit_observation

SERVICE_NAME = "deos-sample-project"


class Default(WorkerEntrypoint):
    """Authenticate Linear deliveries and hand relevant ones to a Queue."""

    async def fetch(self, request):
        if request.method != "POST":
            return Response("method not allowed", status=405)

        # Python Workers expose the Request body through the standard text()
        # promise; re-encode it before HMAC verification so the verified bytes
        # are the same bytes parsed by the ACL.
        body = (await request.text()).encode()
        headers = {
            "linear-signature": request.headers.get("linear-signature") or "",
            "linear-timestamp": request.headers.get("linear-timestamp") or "",
            "linear-delivery": request.headers.get("linear-delivery") or "",
        }
        config = LinearIngressConfig(
            signing_secret=self.env.LINEAR_WEBHOOK_SECRET.encode(),
            relevant_project_ids=frozenset(
                project_id
                for project_id in self.env.LINEAR_PROJECT_IDS.split(",")
                if project_id
            ),
            relevant_transitions=frozenset(
                transition
                for transition in (
                    self.env.LINEAR_START_TRANSITIONS.split(",")
                    + self.env.LINEAR_APPROVAL_TRANSITIONS.split(",")
                    + self.env.LINEAR_REJECTION_TRANSITIONS.split(",")
                )
                if transition
            ),
        )
        acl = LinearWebhookACL(config)
        now = datetime.now(UTC)
        try:
            acl.verify(body, headers, now)
            event, relevant = acl.translate(body, headers["linear-delivery"] or None)
        except InvalidWebhook:
            return Response("invalid webhook", status=400)

        classification = (
            DeliveryClassification.RELEVANT if relevant else DeliveryClassification.IRRELEVANT
        )
        delivery = Delivery.from_body(event.source_delivery_id, body, now, classification)
        run_id = workflow_identity(event.project_id, event.issue_id)
        try:
            result = await self.env.DB.prepare(
                """
                INSERT OR IGNORE INTO deliveries
                    (delivery_id, payload_hash, received_at, classification, correlation_id)
                VALUES (?, ?, ?, ?, ?)
                """
            ).bind(
                delivery.delivery_id,
                delivery.payload_hash,
                delivery.received_at.isoformat(),
                delivery.classification.value,
                run_id,
            ).run()
        except Exception:
            if relevant:
                emit_observation(
                    _observation(event, run_id, "ingress.delivery_record", "failed", "d1_operation_failed")
                )
            raise
        if result.meta.changes == 0:
            if relevant:
                try:
                    stored = await self.env.DB.prepare(
                        "SELECT correlation_id FROM deliveries WHERE delivery_id = ?"
                    ).bind(delivery.delivery_id).first()
                    stored_correlation = _row_value(stored, "correlation_id")
                except Exception:
                    emit_observation(
                        _observation(event, run_id, "ingress.delivery_record", "failed", "d1_operation_failed")
                    )
                    raise
                emit_observation(
                    _observation(
                        event,
                        stored_correlation or run_id,
                        "ingress.delivery_record",
                        "duplicate",
                    )
                )
            return Response("duplicate", status=200)
        if not relevant:
            return Response("ignored", status=200)

        emit_observation(
            _observation(event, run_id, "ingress.delivery_record", "succeeded")
        )
        emit_observation(
            _observation(event, run_id, "queue.publish", "started")
        )
        try:
            await self.env.QUEUE.send(
                {
                    "event_id": event.event_id,
                    "source_delivery_id": event.source_delivery_id,
                    "issue_id": event.issue_id,
                    "project_id": event.project_id,
                    "transition": event.transition,
                    "actor_id": event.actor_id,
                    "occurred_at": event.occurred_at.isoformat(),
                    "correlation_id": run_id,
                }
            )
        except Exception:
            emit_observation(
                _observation(event, run_id, "queue.publish", "failed", "queue_publish_failed")
            )
            raise
        emit_observation(
            _observation(event, run_id, "queue.publish", "succeeded")
        )
        # Linear treats any non-200 response as a failed delivery and retries.
        return Response("accepted", status=200)


def _observation(
    event: ApplicationEvent,
    correlation_id: str,
    stage: str,
    outcome: str,
    error_type: str | None = None,
) -> Observation:
    return build_observation(
        service_name=SERVICE_NAME,
        stage=stage,
        outcome=outcome,
        correlation_id=correlation_id,
        delivery_id=event.source_delivery_id,
        issue_id=event.issue_id,
        project_id=event.project_id,
        run_id=workflow_identity(event.project_id, event.issue_id),
        error_type=error_type,
    )


def _row_value(row: Any, key: str) -> str | None:
    if row is None:
        return None
    if isinstance(row, dict):
        value = row.get(key)
    else:
        value = getattr(row, key, None)
    return value if isinstance(value, str) and value else None
