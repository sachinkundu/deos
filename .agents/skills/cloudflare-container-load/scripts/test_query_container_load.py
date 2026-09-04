from __future__ import annotations

import importlib.util
import tempfile
import unittest
from datetime import UTC, datetime
from pathlib import Path
from types import ModuleType
from unittest.mock import patch

SCRIPT = Path(__file__).with_name("query_container_load.py")


def load_script() -> ModuleType:
    spec = importlib.util.spec_from_file_location("query_container_load", SCRIPT)
    if spec is None or spec.loader is None:
        raise RuntimeError("could not load container audit helper")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


audit = load_script()


class QueryContainerLoadTests(unittest.TestCase):
    def test_parse_iso_treats_legacy_d1_timestamp_as_utc(self) -> None:
        parsed = audit.parse_iso("2026-08-18 07:09:03")

        self.assertEqual(parsed, datetime(2026, 8, 18, 7, 9, 3, tzinfo=UTC))

    def test_peak_overlap_ends_before_start_at_same_instant(self) -> None:
        rows = [
            {
                "created_at": "2026-08-31T11:00:00Z",
                "started_at": "2026-08-31T11:00:01Z",
                "ended_at": "2026-08-31T11:01:00Z",
                "updated_at": "2026-08-31T11:01:00Z",
                "cleanup_state": "destroyed",
            },
            {
                "created_at": "2026-08-31T11:00:30Z",
                "started_at": "2026-08-31T11:00:31Z",
                "ended_at": "2026-08-31T11:02:00Z",
                "updated_at": "2026-08-31T11:02:00Z",
                "cleanup_state": "destroyed",
            },
            {
                "created_at": "2026-08-31T11:01:00Z",
                "started_at": "2026-08-31T11:01:01Z",
                "ended_at": "2026-08-31T11:03:00Z",
                "updated_at": "2026-08-31T11:03:00Z",
                "cleanup_state": "destroyed",
            },
        ]

        peak, at = audit.peak_overlap(
            rows,
            start_key="created_at",
            open_states={"pending", "starting", "running", "collecting"},
            end_after_cleanup=True,
        )

        self.assertEqual(peak, 2)
        self.assertEqual(at, datetime(2026, 8, 31, 11, 0, 30, tzinfo=UTC))

    def test_peak_overlap_keeps_live_attempt_open_until_audit(self) -> None:
        rows = [
            {
                "state": "running",
                "created_at": "2026-08-31T11:00:00Z",
                "started_at": "2026-08-31T11:00:01Z",
                "ended_at": None,
                "updated_at": "2026-08-31T11:00:05Z",
            },
            {
                "state": "pending",
                "created_at": "2026-08-31T11:01:00Z",
                "started_at": None,
                "ended_at": None,
                "updated_at": "2026-08-31T11:01:00Z",
            },
        ]

        peak, _ = audit.peak_overlap(
            rows,
            start_key="created_at",
            open_states={"pending", "starting", "running", "collecting"},
            end_after_cleanup=True,
        )

        self.assertEqual(peak, 2)

    def test_allocated_peak_keeps_collecting_open_but_running_peak_closes_it(self) -> None:
        rows = [
            {
                "state": "collecting",
                "created_at": "2026-08-31T11:00:00Z",
                "started_at": "2026-08-31T11:00:01Z",
                "ended_at": None,
                "updated_at": "2026-08-31T11:01:00Z",
            },
            {
                "state": "running",
                "created_at": "2026-08-31T11:02:00Z",
                "started_at": "2026-08-31T11:02:01Z",
                "ended_at": None,
                "updated_at": "2026-08-31T11:02:02Z",
            },
        ]

        allocated, _ = audit.peak_overlap(
            rows,
            start_key="created_at",
            open_states={"pending", "starting", "running", "collecting"},
            end_after_cleanup=True,
        )
        running, _ = audit.peak_overlap(
            rows,
            start_key="started_at",
            open_states={"pending", "starting", "running"},
        )

        self.assertEqual(allocated, 2)
        self.assertEqual(running, 1)

    def test_allocated_peak_ends_only_after_destroyed_cleanup(self) -> None:
        rows = [
            {
                "state": "completed",
                "cleanup_state": "failed",
                "created_at": "2026-08-31T11:00:00Z",
                "started_at": "2026-08-31T11:00:01Z",
                "ended_at": "2026-08-31T11:01:00Z",
                "updated_at": "2026-08-31T11:01:05Z",
            },
            {
                "state": "running",
                "cleanup_state": "pending",
                "created_at": "2026-08-31T11:02:00Z",
                "started_at": "2026-08-31T11:02:01Z",
                "ended_at": None,
                "updated_at": "2026-08-31T11:02:02Z",
            },
        ]

        allocated, _ = audit.peak_overlap(
            rows,
            start_key="created_at",
            open_states={"pending", "starting", "running", "collecting"},
            end_after_cleanup=True,
        )

        self.assertEqual(allocated, 2)

    def test_minute_peak_counts_distinct_instances(self) -> None:
        rows = [
            {"dimensions": {"datetimeMinute": "2026-08-31T11:59:00Z", "instanceId": "a"}},
            {"dimensions": {"datetimeMinute": "2026-08-31T11:59:00Z", "instanceId": "a"}},
            {"dimensions": {"datetimeMinute": "2026-08-31T11:59:00Z", "instanceId": "b"}},
        ]

        peak, at = audit.minute_peak(rows)

        self.assertEqual(peak, 2)
        self.assertEqual(at, "2026-08-31T11:59:00Z")

    def test_graphql_rows_splits_a_saturated_window(self) -> None:
        start = datetime(2026, 8, 31, 0, 0, tzinfo=UTC)
        end = datetime(2026, 9, 1, 0, 0, tzinfo=UTC)
        saturated = [{"dimensions": {}}] * audit.GRAPHQL_LIMIT
        left = [{"dimensions": {"instanceId": "left"}}]
        right = [{"dimensions": {"instanceId": "right"}}]

        with patch.object(audit, "graphql_window", side_effect=[saturated, left, right]) as query:
            rows = audit.graphql_rows(
                account_id="a" * 32,
                token="token",
                application_id="app",
                start=start,
                end=end,
            )

        self.assertEqual(rows, left + right)
        self.assertEqual(query.call_count, 3)

    def test_dotenv_does_not_execute_shell_content(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / ".env"
            path.write_text(
                'CLOUDFLARE_API_TOKEN="safe-token"\nIGNORED=$(must-not-run)\n',
                encoding="utf-8",
            )

            values = audit.parse_dotenv(path)

        self.assertEqual(values, {"CLOUDFLARE_API_TOKEN": "safe-token"})

    def test_api_token_prefers_environment(self) -> None:
        with (
            tempfile.TemporaryDirectory() as directory,
            patch.dict("os.environ", {"CLOUDFLARE_API_TOKEN": "environment-token"}, clear=True),
            patch.object(audit, "wrangler_oauth_token", return_value="oauth-token"),
        ):
            token = audit.api_token(Path(directory) / ".env")

        self.assertEqual(token, "environment-token")

    def test_command_environment_passes_token_without_dropping_existing_values(self) -> None:
        with patch.dict("os.environ", {"EXISTING": "kept"}, clear=True):
            environment = audit.command_environment("secret-token")

        self.assertEqual(environment["EXISTING"], "kept")
        self.assertEqual(environment["CLOUDFLARE_API_TOKEN"], "secret-token")

    def test_capacity_match_is_bounded_to_failure_text(self) -> None:
        self.assertIsNotNone(audit.CAPACITY_RE.search("maximum instance limit reached"))
        self.assertIsNone(audit.CAPACITY_RE.search("repository checkout transport failed"))


if __name__ == "__main__":
    unittest.main()
