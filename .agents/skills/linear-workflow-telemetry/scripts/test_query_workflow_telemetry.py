from __future__ import annotations

import importlib.util
import io
import json
import os
import tempfile
import unittest
from datetime import UTC, datetime
from pathlib import Path
from types import ModuleType
from unittest.mock import patch

SCRIPT = Path(__file__).with_name("query_workflow_telemetry.py")


def load_script() -> ModuleType:
    spec = importlib.util.spec_from_file_location("query_workflow_telemetry", SCRIPT)
    if spec is None or spec.loader is None:
        raise RuntimeError("could not load query helper")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


telemetry = load_script()


def event(
    *,
    timestamp: str,
    correlation: str = "workflow:project-1:issue-1",
    project_id: str = "project-1",
    issue_id: str = "issue-1",
    stage: str = "queue.consume",
    outcome: str = "succeeded",
    **optional: str | int,
) -> dict[str, object]:
    source: dict[str, str | int] = {
        "event.time": timestamp,
        "service.name": "deos-queue-consumer-ts",
        "deos.workflow.correlation_id": correlation,
        "deos.workflow.stage": stage,
        "deos.workflow.outcome": outcome,
        "linear.delivery.id": "delivery-1",
        "linear.issue.id": issue_id,
        "linear.project.id": project_id,
        "deos.workflow.run_id": correlation,
        **optional,
    }
    return {
        "timestamp": int(datetime.fromisoformat(timestamp).timestamp() * 1000),
        "source": {"message": source},
        "$metadata": {"service": "fallback-service"},
    }


class QueryWorkflowTelemetryTests(unittest.TestCase):
    def test_credentials_load_from_dotenv_without_shell_evaluation(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            env_file = Path(directory) / ".env"
            wrangler_config = Path(directory) / "wrangler.jsonc"
            env_file.write_text(
                'CLOUDFLARE_TOKEN="local-token"\nIGNORED=$(must-not-run)\n',
                encoding="utf-8",
            )
            wrangler_config.write_text(
                '// local config\n{"account_id": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}\n',
                encoding="utf-8",
            )
            with patch.dict(os.environ, {}, clear=True):
                account_id, api_token = telemetry.load_credentials(env_file, wrangler_config)

        self.assertEqual(account_id, "a" * 32)
        self.assertEqual(api_token, "local-token")

    def test_build_query_uses_exact_needle_and_millisecond_timeframe(self) -> None:
        start = datetime(2026, 8, 14, 5, 0, tzinfo=UTC)
        end = datetime(2026, 8, 14, 6, 0, tzinfo=UTC)

        query = telemetry.build_query("issue-1", start, end, limit=50)

        self.assertEqual(query["view"], "events")
        self.assertTrue(query["queryId"].startswith("linear-workflow-telemetry-"))
        self.assertEqual(query["timeframe"]["from"], int(start.timestamp() * 1000))
        self.assertEqual(query["timeframe"]["to"], int(end.timestamp() * 1000))
        self.assertEqual(
            query["parameters"]["needle"],
            {"value": "issue-1", "matchCase": True, "isRegex": False},
        )

    def test_post_query_keeps_token_in_authorization_header(self) -> None:
        payload = {
            "success": True,
            "result": {"run": {"status": "COMPLETED"}, "events": {"count": 0, "events": []}},
        }
        response = io.BytesIO(json.dumps(payload).encode("utf-8"))
        start = datetime(2026, 8, 14, 5, 0, tzinfo=UTC)
        query = telemetry.build_query("issue-1", start, start.replace(hour=6), limit=50)

        with patch.object(telemetry, "urlopen", return_value=response) as mocked:
            result = telemetry.post_query(
                account_id="a" * 32,
                api_token="secret-token",
                query=query,
                timeout=5,
            )

        request = mocked.call_args.args[0]
        self.assertEqual(request.get_header("Authorization"), "Bearer secret-token")
        self.assertNotIn(b"secret-token", request.data)
        self.assertEqual(result["run"]["status"], "COMPLETED")

    def test_sanitize_event_emits_only_allowlisted_observation_fields(self) -> None:
        raw = event(
            timestamp="2026-08-14T05:18:48Z",
            **{
                "deos.workflow.attempt.number": 2,
                "deos.workflow.visit_id": "workflow:project-1:issue-1:run:1:visit:7",
                "deos.workflow.traversal_id": (
                    "workflow:project-1:issue-1:run:1:visit:7:transition"
                ),
                "error.type": "linear_http_failed",
                "authorization": "must-not-escape",
            },
        )

        sanitized = telemetry.sanitize_event(raw)

        self.assertEqual(sanitized["deos.workflow.attempt.number"], 2)
        self.assertEqual(
            sanitized["deos.workflow.visit_id"],
            "workflow:project-1:issue-1:run:1:visit:7",
        )
        self.assertEqual(
            sanitized["deos.workflow.traversal_id"],
            "workflow:project-1:issue-1:run:1:visit:7:transition",
        )
        self.assertEqual(sanitized["error.type"], "linear_http_failed")
        self.assertNotIn("authorization", sanitized)

    def test_sanitize_event_flattens_cloudflare_nested_otel_fields(self) -> None:
        raw = {
            "timestamp": 1786684735558,
            "source": {
                "event": {"time": "2026-08-14T05:18:55.558Z"},
                "service": {"name": "deos-queue-consumer-ts"},
                "deos": {
                    "workflow": {
                        "correlation_id": "workflow:project-1:issue-1",
                        "stage": "queue.consume",
                        "outcome": "succeeded",
                        "run_id": "workflow:project-1:issue-1",
                        "attempt": {"number": 1},
                    }
                },
                "linear": {
                    "delivery": {"id": "delivery-1"},
                    "issue": {"id": "issue-1"},
                    "project": {"id": "project-1"},
                },
                "raw_secret": "must-not-escape",
            },
            "$metadata": {"service": "deos-queue-consumer-ts"},
        }

        sanitized = telemetry.sanitize_event(raw)

        self.assertEqual(sanitized["deos.workflow.correlation_id"], "workflow:project-1:issue-1")
        self.assertEqual(sanitized["deos.workflow.attempt.number"], 1)
        self.assertNotIn("raw_secret", sanitized)

    def test_multiple_project_correlations_are_ambiguous(self) -> None:
        correlations = {
            "workflow:project-1:issue-1",
            "workflow:project-1:issue-2",
        }

        with self.assertRaisesRegex(telemetry.TelemetryError, "refusing to guess"):
            telemetry.require_single_correlation(correlations, window="test window")

    def test_project_time_mode_lists_chronological_timeline(self) -> None:
        project_id = "99426d9b-cda7-4db4-9136-692a95a0b090"
        issue_id = "0b1681ec-c651-4572-a0c7-bd95f2a6d09c"
        correlation = f"workflow:{project_id}:{issue_id}"
        later = event(
            timestamp="2026-08-14T05:18:49Z",
            correlation=correlation,
            project_id=project_id,
            issue_id=issue_id,
            stage="linear.issue_update",
            outcome="succeeded",
        )
        earlier = event(
            timestamp="2026-08-14T05:18:47Z",
            correlation=correlation,
            project_id=project_id,
            issue_id=issue_id,
            stage="ingress.delivery_record",
            outcome="succeeded",
            **{"messaging.message.id": "message-1"},
        )
        discovery = {"events": {"events": [earlier]}, "run": {"status": "COMPLETED"}}
        timeline = {"events": {"events": [later, earlier]}, "run": {"status": "COMPLETED"}}
        arguments = telemetry.parser().parse_args(
            [
                "--issue-key",
                "SAC-87",
                "--project-id",
                project_id,
                "--event-time",
                "2026-08-14T05:18:47.208Z",
            ]
        )

        with (
            patch.dict(
                os.environ,
                {"CLOUDFLARE_ACCOUNT_ID": "a" * 32, "CLOUDFLARE_API_TOKEN": "token"},
                clear=False,
            ),
            patch.object(telemetry, "post_query", side_effect=[discovery, timeline]),
            patch("sys.stdout", new_callable=io.StringIO) as output,
        ):
            telemetry.run(arguments)

        rendered = output.getvalue()
        self.assertIn(f"Correlation ID: {correlation}", rendered)
        self.assertIn("Queue message IDs: message-1", rendered)
        self.assertLess(
            rendered.index("ingress.delivery_record"), rendered.index("linear.issue_update")
        )
        self.assertNotIn("token", rendered)


if __name__ == "__main__":
    unittest.main()
