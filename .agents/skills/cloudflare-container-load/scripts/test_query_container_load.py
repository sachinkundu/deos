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
            },
            {
                "created_at": "2026-08-31T11:00:30Z",
                "started_at": "2026-08-31T11:00:31Z",
                "ended_at": "2026-08-31T11:02:00Z",
                "updated_at": "2026-08-31T11:02:00Z",
            },
            {
                "created_at": "2026-08-31T11:01:00Z",
                "started_at": "2026-08-31T11:01:01Z",
                "ended_at": "2026-08-31T11:03:00Z",
                "updated_at": "2026-08-31T11:03:00Z",
            },
        ]

        peak, at = audit.peak_overlap(rows, start_key="created_at")

        self.assertEqual(peak, 2)
        self.assertEqual(at, datetime(2026, 8, 31, 11, 0, 30, tzinfo=UTC))

    def test_minute_peak_counts_distinct_instances(self) -> None:
        rows = [
            {"dimensions": {"datetimeMinute": "2026-08-31T11:59:00Z", "instanceId": "a"}},
            {"dimensions": {"datetimeMinute": "2026-08-31T11:59:00Z", "instanceId": "a"}},
            {"dimensions": {"datetimeMinute": "2026-08-31T11:59:00Z", "instanceId": "b"}},
        ]

        peak, at = audit.minute_peak(rows)

        self.assertEqual(peak, 2)
        self.assertEqual(at, "2026-08-31T11:59:00Z")

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

    def test_capacity_match_is_bounded_to_failure_text(self) -> None:
        self.assertIsNotNone(audit.CAPACITY_RE.search("maximum instance limit reached"))
        self.assertIsNone(audit.CAPACITY_RE.search("repository checkout transport failed"))


if __name__ == "__main__":
    unittest.main()
