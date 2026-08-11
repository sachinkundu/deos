import hashlib
import hmac
import json
import unittest
from datetime import UTC, datetime, timedelta

from deos.fakes import FakeQueue, FakeStateStore
from deos.ingress import LinearIngress, LinearIngressConfig, LinearWebhookACL
from deos.ports import DeliveryClassification


class IngressTests(unittest.TestCase):
    secret = b"test-secret"
    now = datetime(2026, 8, 11, 10, 0, tzinfo=UTC)

    def setUp(self) -> None:
        self.queue = FakeQueue()
        self.state = FakeStateStore()
        acl = LinearWebhookACL(
            LinearIngressConfig(
                signing_secret=self.secret,
                relevant_project_ids=frozenset({"project-1"}),
                relevant_transitions=frozenset({"Started"}),
            )
        )
        self.ingress = LinearIngress(acl, self.state, self.queue, lambda: self.now)

    def test_relevant_delivery_is_translated_recorded_and_enqueued(self) -> None:
        body = self._body(project_id="project-1", state="Started")
        result = self.ingress.handle(body, self._headers(body))

        self.assertEqual(result.status_code, 202)
        self.assertEqual(result.classification, DeliveryClassification.RELEVANT)
        self.assertEqual(len(self.queue.events), 1)
        self.assertEqual(self.queue.events[0].project_id, "project-1")
        self.assertEqual(self.queue.events[0].transition, "Started")
        self.assertEqual(len(self.state.deliveries), 1)

    def test_irrelevant_delivery_is_recorded_without_enqueue(self) -> None:
        body = self._body(project_id="other-project", state="Started")
        result = self.ingress.handle(body, self._headers(body))

        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.classification, DeliveryClassification.IRRELEVANT)
        self.assertEqual(self.queue.events, [])
        self.assertEqual(len(self.state.deliveries), 1)

    def test_duplicate_delivery_is_acknowledged_without_second_enqueue(self) -> None:
        body = self._body(project_id="project-1", state="Started")
        headers = self._headers(body)

        first = self.ingress.handle(body, headers)
        duplicate = self.ingress.handle(body, headers)

        self.assertEqual(first.status_code, 202)
        self.assertEqual(duplicate.status_code, 200)
        self.assertEqual(duplicate.classification, DeliveryClassification.DUPLICATE)
        self.assertEqual(len(self.queue.events), 1)

    def test_invalid_signature_and_stale_timestamp_are_rejected(self) -> None:
        body = self._body(project_id="project-1", state="Started")
        invalid = self.ingress.handle(body, {"Linear-Timestamp": "1786442400", "Linear-Signature": "bad"})
        stale_headers = self._headers(body, timestamp=self.now - timedelta(minutes=6))
        stale = self.ingress.handle(body, stale_headers)

        self.assertEqual(invalid.status_code, 400)
        self.assertEqual(stale.status_code, 400)
        self.assertEqual(self.queue.events, [])
        self.assertEqual(self.state.deliveries, {})

    def _body(self, project_id: str, state: str) -> bytes:
        return json.dumps(
            {
                "id": "delivery-1",
                "updatedAt": "2026-08-11T10:00:00Z",
                "actor": {"id": "actor-1"},
                "data": {
                    "id": "issue-1",
                    "project": {"id": project_id},
                    "state": {"name": state},
                },
            },
            separators=(",", ":"),
        ).encode()

    def _headers(self, body: bytes, timestamp: datetime | None = None) -> dict[str, str]:
        moment = timestamp or self.now
        timestamp_text = str(int(moment.timestamp()))
        signed = timestamp_text.encode() + b"." + body
        signature = hmac.new(self.secret, signed, hashlib.sha256).hexdigest()
        return {"Linear-Timestamp": timestamp_text, "Linear-Signature": signature}
