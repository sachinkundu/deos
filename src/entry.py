"""Cloudflare Python Worker entrypoint for the Linear webhook."""

from __future__ import annotations

import hashlib
import json
import traceback
from datetime import UTC, datetime
from typing import Any, cast

from workers import Response, WorkerEntrypoint

from deos.delivery_handoff import dispatch, replay
from deos.ingress import (
    IngressRouteProof,
    InvalidWebhook,
    LinearIngressConfig,
    LinearWebhookACL,
    route_event_proof,
)
from deos.ports import ApplicationEvent, Delivery, DeliveryClassification
from deos.shared_test_route import SharedTestEventRouter
from deos.telemetry import Observation, build_observation, workflow_identity
from worker_telemetry import emit_observation

SERVICE_NAME = "deos-sample-project"


class Default(WorkerEntrypoint):
    """Authenticate Linear deliveries and hand relevant ones to a Queue."""

    env: Any
    ctx: Any

    async def fetch(self, request: Any) -> Any:
        from pyodide.ffi import jsnull

        if request.method != "POST":
            return Response("method not allowed", status=405)

        # Python Workers expose the Request body through the standard text()
        # promise; re-encode it before HMAC verification so the verified bytes
        # are the same bytes parsed by the ACL.
        body = (await request.text()).encode()
        headers: dict[str, str] = {
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
            payload: object = json.loads(cast(bytes, body))
            if not isinstance(payload, dict):
                raise InvalidWebhook("payload must be an object")
            router = SharedTestEventRouter(
                self.env.DB, self._send_test,
                (getattr(self.env, "TEST_MARKER_KEY_V1", "") or "").encode(),
            )
            delivery_id = headers["linear-delivery"]
            if delivery_id and await router.route(
                cast(dict[str, Any], payload), delivery_id,
                int(headers["linear-timestamp"]), now,
            ):
                self.ctx.waitUntil(router.dispatch(delivery_id))
                return Response("accepted test delivery", status=200)
            if headers["linear-delivery"]:
                saved = (
                    await self.env.DB.prepare(
                        "SELECT payload_hash FROM deliveries WHERE delivery_id=?"
                    )
                    .bind(headers["linear-delivery"])
                    .first()
                )
                if _row_value(saved, "payload_hash") is not None:
                    if _row_value(saved, "payload_hash") != hashlib.sha256(body).hexdigest():
                        return Response("delivery payload changed", status=409)
                    self.ctx.waitUntil(
                        dispatch(self.env.DB, self._send, headers["linear-delivery"])
                    )
                    return Response("duplicate", status=200)
            # A saved team test task may have no project. The exact test route
            # above has first claim; other projectless Issue events are ignored.
            data = cast(dict[str, Any], payload).get("data")
            if (
                cast(dict[str, Any], payload).get("type") == "Issue"
                and isinstance(data, dict)
                and isinstance(data.get("id"), str)
                and isinstance(data.get("teamId"), str)
                and not isinstance(data.get("project"), dict)
            ):
                if delivery_id:
                    await self.env.DB.prepare(
                        """INSERT OR IGNORE INTO deliveries
                          (delivery_id,payload_hash,received_at,classification)
                          VALUES (?,?,?,'irrelevant')"""
                    ).bind(delivery_id, hashlib.sha256(body).hexdigest(), now.isoformat()).run()
                return Response("ignored", status=200)
            comment_issue: dict[str, Any] | None = None
            if isinstance(payload, dict) and cast(dict[str, Any], payload).get("type") == "Comment":
                comment_data: object = cast(dict[str, Any], payload).get("data")
                if not isinstance(comment_data, dict):
                    raise InvalidWebhook("comment data missing")
                comment_issue_id: object = cast(dict[str, Any], comment_data).get("issueId")
                if not isinstance(comment_issue_id, str):
                    raise InvalidWebhook("comment issue ID missing")
                row = await _implementation_comment_issue(cast(Any, self).env.DB, comment_issue_id)
                if _row_value(row, "issue_id") is None:
                    return Response("ignored", status=200)
                comment_issue = {
                    "id": _row_value(row, "issue_id"),
                    "identifier": _row_value(row, "issue_key"),
                    "title": _row_value(row, "title"),
                    "url": _row_value(row, "linear_url"),
                    "project": {"id": _row_value(row, "project_id")},
                    "state": {
                        "id": _row_value(row, "route_human_gate_state_id"),
                        "name": "Human Review",
                    },
                }
            event, _ = acl.translate(body, headers["linear-delivery"] or None, comment_issue)
        except (InvalidWebhook, json.JSONDecodeError):
            return Response("invalid webhook", status=400)

        route_proof = await _find_route_proof(self.env.DB, event)
        relevant = route_proof is not None

        classification = (
            DeliveryClassification.RELEVANT if relevant else DeliveryClassification.IRRELEVANT
        )
        delivery = Delivery.from_body(event.source_delivery_id, body, now, classification)
        tier_policy = self.env.SANDBOX_TIER_POLICY_VERSION
        if tier_policy not in ("legacy-basic-v1", "event-label-v1"):
            raise ValueError("unknown sandbox tier release policy")
        run_id = workflow_identity(event.project_id, event.issue_id)
        statement = self.env.DB.prepare(
            """
                INSERT OR IGNORE INTO deliveries
                    (delivery_id, payload_hash, received_at, classification, correlation_id,
                     label_selection_evidence_json, label_selection_evidence_digest,
                     route_project_id, route_revision, route_digest,
                     start_slow_ok, sandbox_tier_policy_version)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """
        ).bind(
            delivery.delivery_id,
            delivery.payload_hash,
            delivery.received_at.isoformat(),
            delivery.classification.value,
            run_id,
            event.label_selection_evidence.canonical_json(),
            event.label_selection_evidence.digest(),
            route_proof.project_id if route_proof is not None else jsnull,
            route_proof.route_revision if route_proof is not None else jsnull,
            route_proof.route_digest if route_proof is not None else jsnull,
            1 if event.start_slow_ok is True else jsnull,
            tier_policy,
        )
        statements = [statement]
        if route_proof is not None:
            message = {
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
                "comment_id": event.comment_id,
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
                "sandbox_tier_policy_version": tier_policy,
                **({"start_slow_ok": True} if event.start_slow_ok is True else {}),
            }
            statements.append(
                self.env.DB.prepare("""INSERT OR IGNORE INTO delivery_handoffs
              (delivery_id,payload_json,created_at) SELECT ?,?,? WHERE EXISTS (
                SELECT 1 FROM deliveries WHERE delivery_id=? AND payload_hash=? AND classification='relevant')""").bind(
                    delivery.delivery_id,
                    json.dumps(message),
                    now.isoformat(),
                    delivery.delivery_id,
                    delivery.payload_hash,
                )
            )
        test_event = _implementation_test_event_statement(self.env.DB, event, delivery)
        if test_event is not None:
            statements.append(test_event)
        try:
            await self.env.DB.batch(statements)
        except Exception:
            traceback.print_exc()
            emit_observation(
                _observation(
                    event, run_id, "ingress.delivery_record", "failed", "d1_operation_failed"
                )
            )
            raise
        if not relevant:
            return Response("ignored", status=200)
        emit_observation(_observation(event, run_id, "ingress.delivery_record", "succeeded"))
        # Durable acceptance precedes acknowledgment. Scheduled replay recovers
        # cancellation, process loss, or an ambiguous successful Queue response.
        self.ctx.waitUntil(dispatch(self.env.DB, self._send, delivery.delivery_id))
        return Response("accepted", status=200)

    async def _send(self, message: object) -> None:
        await self.env.QUEUE.send(_javascript_value(message), contentType="json")

    async def _send_test(self, message: object) -> None:
        await self.env.TEST_QUEUE.send(_javascript_value(message), contentType="json")

    async def scheduled(self, controller: Any, env: Any, ctx: Any) -> None:
        await replay(self.env.DB, self._send)
        router = SharedTestEventRouter(
            self.env.DB, self._send_test,
            (getattr(self.env, "TEST_MARKER_KEY_V1", "") or "").encode(),
        )
        await router.replay()


def _javascript_value(value: object):
    """Deep-convert Queue payloads before crossing the Pyodide FFI boundary."""
    from js import Object
    from pyodide.ffi import to_js

    return to_js(value, dict_converter=Object.fromEntries)


async def _record_implementation_test_event(
    database: Any, event: ApplicationEvent, delivery: Delivery
) -> None:
    statement = _implementation_test_event_statement(database, event, delivery)
    if statement is not None:
        await statement.run()


def _implementation_test_event_statement(
    database: Any, event: ApplicationEvent, delivery: Delivery
) -> Any:
    """Capture only verified provider state changes for a reserved test issue."""
    from pyodide.ffi import jsnull

    if event.event_kind != "Issue.update" or not event.actor_id or not event.state_id:
        return None
    return (
        database.prepare(
            """INSERT OR IGNORE INTO implementation_test_events
        (delivery_id, resource_id, issue_id, actor_id, from_state_id, to_state_id,
         provider_time, payload_sha, received_at)
        SELECT ?, resource_id, ?, ?, ?, ?, ?, ?, ? FROM implementation_resources
        WHERE kind='safe_test' AND provider='github-linear-review-v1' AND provider_resource_id=?"""
        )
        .bind(
            delivery.delivery_id,
            event.issue_id,
            event.actor_id,
            event.previous_state_id if event.previous_state_id else jsnull,
            event.state_id,
            event.occurred_at.isoformat(),
            delivery.payload_hash,
            delivery.received_at.isoformat(),
            event.issue_id,
        )
    )


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


async def _implementation_comment_issue(database: Any, issue_id: str) -> Any:
    return (
        await database.prepare("""
        SELECT i.*,r.route_human_gate_state_id FROM linear_issue_index i
        JOIN orchestration_runs r ON r.issue_id=i.issue_id AND r.project_id=i.project_id
        WHERE i.issue_id=? AND r.definition_id='implementation'
        AND r.status IN ('pending_dispatch','active','awaiting_human','awaiting_capability','manual_reconciliation_required')
        ORDER BY r.run_sequence DESC LIMIT 1
    """)
        .bind(issue_id)
        .first()
    )
