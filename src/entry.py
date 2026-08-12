"""Cloudflare Python Worker entrypoint for the Linear webhook."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import NAMESPACE_URL, uuid4, uuid5

from workers import Response, WorkerEntrypoint

from deos.ingress import InvalidWebhook, LinearIngressConfig, LinearWebhookACL
from deos.ports import ApplicationEvent, Delivery, DeliveryClassification
from deos.telemetry import emit_otel_event

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
        now = datetime.now(UTC)
        correlation_id = headers["linear-delivery"] or "unknown"
        emit_otel_event(
            "deos.ingress.received",
            service_name=SERVICE_NAME,
            correlation_id=correlation_id,
            timestamp=now,
            attributes={"http.request.method": request.method},
        )
        config = LinearIngressConfig(
            signing_secret=self.env.LINEAR_WEBHOOK_SECRET.encode(),
            relevant_project_ids=frozenset(
                project_id for project_id in self.env.LINEAR_PROJECT_IDS.split(",") if project_id
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
        try:
            acl.verify(body, headers, now)
            event, relevant = acl.translate(body, headers["linear-delivery"] or None)
        except InvalidWebhook:
            emit_otel_event(
                "deos.ingress.rejected",
                service_name=SERVICE_NAME,
                correlation_id=correlation_id,
                timestamp=now,
                attributes={"error.type": "invalid_webhook"},
                severity_number=13,
                severity_text="WARN",
            )
            return Response("invalid webhook", status=400)

        correlation_id = event.source_delivery_id
        common_attributes = {
            "deos.delivery.id": event.source_delivery_id,
            "deos.issue.id": event.issue_id,
            "deos.project.id": event.project_id,
        }

        classification = (
            DeliveryClassification.RELEVANT if relevant else DeliveryClassification.IRRELEVANT
        )
        delivery = Delivery.from_body(event.source_delivery_id, body, now, classification)
        result = (
            await self.env.DB.prepare(
                """
            INSERT OR IGNORE INTO deliveries
                (delivery_id, payload_hash, received_at, classification)
            VALUES (?, ?, ?, ?)
            """
            )
            .bind(
                delivery.delivery_id,
                delivery.payload_hash,
                delivery.received_at.isoformat(),
                delivery.classification.value,
            )
            .run()
        )
        if result.meta.changes == 0:
            emit_otel_event(
                "deos.ingress.duplicate",
                service_name=SERVICE_NAME,
                correlation_id=correlation_id,
                timestamp=now,
                attributes=common_attributes,
            )
            return Response("duplicate", status=200)
        if not relevant:
            emit_otel_event(
                "deos.ingress.ignored",
                service_name=SERVICE_NAME,
                correlation_id=correlation_id,
                timestamp=now,
                attributes=common_attributes,
            )
            return Response("ignored", status=200)

        await self.env.QUEUE.send(
            {
                "event_id": event.event_id,
                "source_delivery_id": event.source_delivery_id,
                "issue_id": event.issue_id,
                "project_id": event.project_id,
                "transition": event.transition,
                "actor_id": event.actor_id,
                "occurred_at": event.occurred_at.isoformat(),
            }
        )
        emit_otel_event(
            "deos.queue.published",
            service_name=SERVICE_NAME,
            correlation_id=correlation_id,
            timestamp=now,
            attributes=common_attributes,
        )
        emit_otel_event(
            "deos.ingress.accepted",
            service_name=SERVICE_NAME,
            correlation_id=correlation_id,
            timestamp=now,
            attributes=common_attributes,
        )
        # Linear treats any non-200 response as a failed delivery and retries.
        return Response("accepted", status=200)

    async def queue(self, batch):
        """Consume accepted events and persist the first workflow transitions."""
        await (
            self.env.DB.prepare(
                "INSERT INTO queue_consumptions (consumption_id, batch_size, received_at) "
                "VALUES (?, ?, ?)"
            )
            .bind(
                str(uuid4()),
                len(batch.messages),
                datetime.now(UTC).isoformat(),
            )
            .run()
        )
        for message in batch.messages:
            body = message.body
            event = ApplicationEvent(
                event_id=body["event_id"],
                source_delivery_id=body["source_delivery_id"],
                issue_id=body["issue_id"],
                project_id=body["project_id"],
                transition=body["transition"],
                actor_id=body.get("actor_id"),
                occurred_at=datetime.fromisoformat(body["occurred_at"]),
            )
            correlation_id = event.source_delivery_id
            emit_otel_event(
                "deos.queue.consumed",
                service_name=SERVICE_NAME,
                correlation_id=correlation_id,
                timestamp=datetime.now(UTC),
                attributes={
                    "deos.delivery.id": event.source_delivery_id,
                    "deos.issue.id": event.issue_id,
                    "deos.project.id": event.project_id,
                },
            )
            run_id = str(uuid5(NAMESPACE_URL, f"deos:{event.project_id}:{event.issue_id}"))
            await (
                self.env.DB.prepare(
                    "INSERT OR IGNORE INTO workflow_runs "
                    "(run_id, project_id, issue_id, current_state, correlation_id, created_at, updated_at) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?)"
                )
                .bind(
                    run_id,
                    event.project_id,
                    event.issue_id,
                    "awaiting_human_approval",
                    event.event_id,
                    event.occurred_at.isoformat(),
                    event.occurred_at.isoformat(),
                )
                .run()
            )
            for previous_state, next_state, cause in (
                ("received", "queued", "queue-consumed"),
                ("queued", "requirements_in_progress", "workflow-started"),
                ("requirements_in_progress", "awaiting_human_approval", "approval-required"),
            ):
                await (
                    self.env.DB.prepare(
                        "INSERT OR IGNORE INTO workflow_transitions "
                        "(run_id, previous_state, next_state, cause, actor_id, occurred_at) "
                        "VALUES (?, ?, ?, ?, ?, ?)"
                    )
                    .bind(
                        run_id,
                        previous_state,
                        next_state,
                        cause,
                        event.actor_id,
                        event.occurred_at.isoformat(),
                    )
                    .run()
                )
                emit_otel_event(
                    "deos.workflow.transition",
                    service_name=SERVICE_NAME,
                    correlation_id=correlation_id,
                    timestamp=event.occurred_at,
                    attributes={
                        "deos.workflow.run.id": run_id,
                        "deos.workflow.state.previous": previous_state,
                        "deos.workflow.state.next": next_state,
                        "deos.workflow.transition.cause": cause,
                    },
                )
