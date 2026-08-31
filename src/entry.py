"""Cloudflare Python Worker entrypoint for the Linear webhook."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from workers import Response, WorkerEntrypoint

from deos.ingress import (
    IngressRouteProof,
    InvalidWebhook,
    LinearIngressConfig,
    LinearWebhookACL,
    route_event_proof,
)
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
            relevant_project_ids=frozenset(),
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
            event, _ = acl.translate(body, headers["linear-delivery"] or None)
        except InvalidWebhook:
            return Response("invalid webhook", status=400)

        route_proof = await _find_route_proof(self.env.DB, event)
        relevant = route_proof is not None

        classification = (
            DeliveryClassification.RELEVANT if relevant else DeliveryClassification.IRRELEVANT
        )
        delivery = Delivery.from_body(event.source_delivery_id, body, now, classification)
        run_id = workflow_identity(event.project_id, event.issue_id)
        try:
            result = (
                await self.env.DB.prepare(
                    """
                INSERT OR IGNORE INTO deliveries
                    (delivery_id, payload_hash, received_at, classification, correlation_id,
                     label_selection_evidence_json, label_selection_evidence_digest,
                     route_project_id, route_revision, route_digest)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """
                )
                .bind(
                    delivery.delivery_id,
                    delivery.payload_hash,
                    delivery.received_at.isoformat(),
                    delivery.classification.value,
                    run_id,
                    event.label_selection_evidence.canonical_json(),
                    event.label_selection_evidence.digest(),
                    route_proof.project_id if route_proof is not None else None,
                    route_proof.route_revision if route_proof is not None else None,
                    route_proof.route_digest if route_proof is not None else None,
                )
                .run()
            )
        except Exception:
            if relevant:
                emit_observation(
                    _observation(
                        event, run_id, "ingress.delivery_record", "failed", "d1_operation_failed"
                    )
                )
            raise
        if result.meta.changes == 0:
            if relevant:
                try:
                    stored = (
                        await self.env.DB.prepare(
                            "SELECT correlation_id FROM deliveries WHERE delivery_id = ?"
                        )
                        .bind(delivery.delivery_id)
                        .first()
                    )
                    stored_correlation = _row_value(stored, "correlation_id")
                except Exception:
                    emit_observation(
                        _observation(
                            event,
                            run_id,
                            "ingress.delivery_record",
                            "failed",
                            "d1_operation_failed",
                        )
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

        emit_observation(_observation(event, run_id, "ingress.delivery_record", "succeeded"))
        emit_observation(_observation(event, run_id, "queue.publish", "started"))
        try:
            await self.env.QUEUE.send(
                _javascript_value(
                    {
                        "event_id": event.event_id,
                        "source_delivery_id": event.source_delivery_id,
                        "issue_id": event.issue_id,
                        "issue_key": event.issue_key,
                        "issue_title": event.issue_title,
                        "issue_url": event.issue_url,
                        "project_id": event.project_id,
                        "transition": event.transition,
                        "actor_id": event.actor_id,
                        "actor_type": event.actor_type,
                        "event_kind": event.event_kind,
                        "state_id": event.state_id,
                        "previous_state_id": event.previous_state_id,
                        "previous_state_name": event.previous_state_name,
                        "occurred_at": event.occurred_at.isoformat(),
                        "correlation_id": run_id,
                        "payload_digest": delivery.payload_hash,
                        "label_selection_evidence": event.label_selection_evidence.as_dict(),
                        "label_selection_evidence_digest": event.label_selection_evidence.digest(),
                        "route_revision": route_proof.route_revision,
                        "route_digest": route_proof.route_digest,
                    }
                ),
                contentType="json",
            )
        except Exception:
            emit_observation(
                _observation(event, run_id, "queue.publish", "failed", "queue_publish_failed")
            )
            raise
        emit_observation(_observation(event, run_id, "queue.publish", "succeeded"))
        # Linear treats any non-200 response as a failed delivery and retries.
        return Response("accepted", status=200)


def _javascript_value(value: object):
    """Deep-convert Queue payloads before crossing the Pyodide FFI boundary."""
    from js import Object
    from pyodide.ffi import to_js

    return to_js(value, dict_converter=Object.fromEntries)


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


def _row_any(row: Any, key: str) -> Any:
    if row is None:
        return None
    if isinstance(row, dict):
        return row.get(key)
    return getattr(row, key, None)


def _proof_from_row(row: Any) -> IngressRouteProof | None:
    project_id = _row_any(row, "project_id")
    route_revision = _row_any(row, "route_revision")
    route_digest = _row_any(row, "route_digest")
    start_state_name = _row_any(row, "start_state_name")
    dispatch_enabled = _row_any(row, "dispatch_enabled")
    if (
        not isinstance(project_id, str)
        or not project_id
        or not isinstance(route_revision, int)
        or isinstance(route_revision, bool)
        or route_revision <= 0
        or not isinstance(route_digest, str)
        or len(route_digest) != 64
        or any(character not in "0123456789abcdef" for character in route_digest)
        or not isinstance(start_state_name, str)
        or not start_state_name
        or dispatch_enabled not in (0, 1, False, True)
    ):
        return None
    return IngressRouteProof(
        project_id=project_id,
        route_revision=route_revision,
        route_digest=route_digest,
        start_state_name=start_state_name,
        dispatch_enabled=bool(dispatch_enabled),
    )


async def _find_route_proof(database: Any, event: ApplicationEvent) -> IngressRouteProof | None:
    active_row = (
        await database.prepare(
            """
            SELECT project_id, route_revision, route_digest,
                   COALESCE(route_start_state_name, '') AS start_state_name,
                   0 AS dispatch_enabled
            FROM orchestration_runs
            WHERE project_id = ? AND issue_id = ?
              AND status IN ('pending_dispatch', 'active', 'awaiting_human',
                             'awaiting_capability', 'manual_reconciliation_required')
            ORDER BY run_sequence DESC LIMIT 1
            """
        )
        .bind(event.project_id, event.issue_id)
        .first()
    )
    active = _proof_from_row(active_row)
    if active is not None:
        return route_event_proof(event, None, active)
    route_row = (
        await database.prepare(
            """
            SELECT project_id, route_revision, route_digest, start_state_name, dispatch_enabled
            FROM project_workflow_policies WHERE project_id = ? LIMIT 1
            """
        )
        .bind(event.project_id)
        .first()
    )
    return route_event_proof(event, _proof_from_row(route_row), active)
