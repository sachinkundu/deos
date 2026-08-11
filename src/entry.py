"""Cloudflare Python Worker entrypoint for the Linear webhook."""

from __future__ import annotations

from datetime import datetime, timezone

from deos.ingress import InvalidWebhook, LinearIngressConfig, LinearWebhookACL
from deos.ports import Delivery, DeliveryClassification
from workers import Response, WorkerEntrypoint


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
                for transition in self.env.LINEAR_START_TRANSITIONS.split(",")
                if transition
            ),
        )
        acl = LinearWebhookACL(config)
        now = datetime.now(timezone.utc)
        try:
            acl.verify(body, headers, now)
            event, relevant = acl.translate(body, headers["linear-delivery"] or None)
        except InvalidWebhook:
            return Response("invalid webhook", status=400)

        classification = (
            DeliveryClassification.RELEVANT if relevant else DeliveryClassification.IRRELEVANT
        )
        delivery = Delivery.from_body(event.source_delivery_id, body, now, classification)
        result = await self.env.DB.prepare(
            """
            INSERT OR IGNORE INTO deliveries
                (delivery_id, payload_hash, received_at, classification)
            VALUES (?, ?, ?, ?)
            """
        ).bind(
            delivery.delivery_id,
            delivery.payload_hash,
            delivery.received_at.isoformat(),
            delivery.classification.value,
        ).run()
        if result.meta.changes == 0:
            return Response("duplicate", status=200)
        if not relevant:
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
        # Linear treats any non-200 response as a failed delivery and retries.
        return Response("accepted", status=200)
