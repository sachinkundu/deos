#!/usr/bin/env python3
"""List allowlisted deos workflow observations for one Linear issue."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from collections.abc import Mapping, Sequence
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen
from uuid import UUID, uuid4

API_ROOT = "https://api.cloudflare.com/client/v4"
ACCOUNT_ID_RE = re.compile(r"^[0-9a-fA-F]{32}$")
WRANGLER_ACCOUNT_ID_RE = re.compile(r'"account_id"\s*:\s*"([0-9a-fA-F]{32})"')
ISSUE_KEY_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_-]*-[0-9]+$")
CORRELATION_PREFIX = "workflow:"
DISCOVERY_MINUTES = 2
MAX_QUERY_EVENTS = 2000
POLL_ATTEMPTS = 8
POLL_DELAY_SECONDS = 0.5

OBSERVATION_KEYS = (
    "event.time",
    "event.name",
    "service.name",
    "deos.telemetry.schema_version",
    "deos.workflow.correlation_id",
    "deos.workflow.stage",
    "deos.workflow.outcome",
    "linear.delivery.id",
    "linear.issue.id",
    "linear.project.id",
    "deos.workflow.run_id",
    "error.type",
    "messaging.message.id",
    "deos.workflow.attempt.number",
    "deos.workflow.previous_state",
    "deos.workflow.next_state",
    "deos.workflow.cause",
)


class TelemetryError(RuntimeError):
    """Expected operator-facing failure without secret-bearing context."""


def parse_timestamp(value: str) -> datetime:
    """Parse an ISO-8601 timestamp and normalize it to UTC."""
    normalized = value.strip().replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError as exc:
        raise TelemetryError(f"invalid ISO-8601 timestamp: {value}") from exc
    if parsed.tzinfo is None:
        raise TelemetryError("event time must include a timezone")
    return parsed.astimezone(UTC)


def parse_dotenv(path: Path) -> dict[str, str]:
    """Read expected dotenv syntax without executing shell content."""
    if not path.exists():
        return {}
    values: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line.removeprefix("export ").lstrip()
        key, separator, raw_value = line.partition("=")
        if not separator:
            continue
        key = key.strip()
        value = raw_value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
            value = value[1:-1]
        if key in {"CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN", "CLOUDFLARE_TOKEN"}:
            values[key] = value
    return values


def wrangler_account_id(path: Path) -> str | None:
    """Read the non-secret account ID from a Wrangler JSONC config."""
    if not path.exists():
        return None
    match = WRANGLER_ACCOUNT_ID_RE.search(path.read_text(encoding="utf-8"))
    return match.group(1) if match else None


def load_credentials(env_file: Path, wrangler_config: Path) -> tuple[str, str]:
    """Load Cloudflare credentials with environment precedence."""
    file_values = parse_dotenv(env_file)
    account_id = (
        os.environ.get("CLOUDFLARE_ACCOUNT_ID")
        or file_values.get("CLOUDFLARE_ACCOUNT_ID")
        or wrangler_account_id(wrangler_config)
    )
    api_token = (
        os.environ.get("CLOUDFLARE_API_TOKEN")
        or os.environ.get("CLOUDFLARE_TOKEN")
        or file_values.get("CLOUDFLARE_API_TOKEN")
        or file_values.get("CLOUDFLARE_TOKEN")
    )
    if not account_id:
        raise TelemetryError(
            "missing Cloudflare account ID: set CLOUDFLARE_ACCOUNT_ID or configure account_id in Wrangler"
        )
    if not api_token:
        raise TelemetryError(
            "missing credential variable: CLOUDFLARE_API_TOKEN (or CLOUDFLARE_TOKEN)"
        )
    assert account_id is not None
    assert api_token is not None
    if not ACCOUNT_ID_RE.fullmatch(account_id):
        raise TelemetryError("CLOUDFLARE_ACCOUNT_ID must be a 32-character hexadecimal ID")
    return account_id, api_token


def build_query(needle: str, start: datetime, end: datetime, *, limit: int) -> dict[str, Any]:
    """Build an ad-hoc exact-needle events query."""
    if start >= end:
        raise TelemetryError("query start must be before query end")
    if not 1 <= limit <= MAX_QUERY_EVENTS:
        raise TelemetryError(f"query limit must be between 1 and {MAX_QUERY_EVENTS}")
    return {
        "queryId": f"linear-workflow-telemetry-{uuid4()}",
        "view": "events",
        "limit": limit,
        "timeframe": {
            "from": int(start.timestamp() * 1000),
            "to": int(end.timestamp() * 1000),
        },
        "parameters": {
            "datasets": [],
            "filterCombination": "and",
            "filters": [],
            "needle": {"value": needle, "matchCase": True, "isRegex": False},
        },
    }


def sanitized_api_error(error: HTTPError) -> str:
    """Extract only Cloudflare-owned error codes and messages."""
    try:
        payload = json.loads(error.read().decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return f"Cloudflare query failed with HTTP {error.code}"
    messages: list[str] = []
    if isinstance(payload, Mapping):
        errors = payload.get("errors")
        if isinstance(errors, Sequence) and not isinstance(errors, (str, bytes)):
            for item in errors:
                if not isinstance(item, Mapping):
                    continue
                code = item.get("code")
                message = item.get("message") or item.get("detail")
                if isinstance(message, str):
                    prefix = f"{code}: " if isinstance(code, (str, int)) else ""
                    messages.append(f"{prefix}{message}")
    suffix = f": {'; '.join(messages[:3])}" if messages else ""
    return f"Cloudflare query failed with HTTP {error.code}{suffix}"


def post_query(
    *, account_id: str, api_token: str, query: Mapping[str, Any], timeout: float
) -> dict[str, Any]:
    """Run one read-only Workers Observability query, polling short STARTED runs."""
    endpoint = (
        f"{API_ROOT}/accounts/{quote(account_id, safe='')}/workers/observability/telemetry/query"
    )
    body = json.dumps(query, separators=(",", ":")).encode("utf-8")
    request = Request(
        endpoint,
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {api_token}",
            "Content-Type": "application/json",
            "User-Agent": "deos-linear-workflow-telemetry/1",
        },
    )
    for attempt in range(POLL_ATTEMPTS):
        try:
            with urlopen(request, timeout=timeout) as response:
                payload = json.load(response)
        except HTTPError as exc:
            raise TelemetryError(sanitized_api_error(exc)) from exc
        except URLError as exc:
            raise TelemetryError("Cloudflare query could not reach the API") from exc
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise TelemetryError("Cloudflare returned a non-JSON query response") from exc
        if not isinstance(payload, dict) or payload.get("success") is not True:
            raise TelemetryError("Cloudflare returned an unsuccessful query response")
        result = payload.get("result")
        if not isinstance(result, dict):
            raise TelemetryError("Cloudflare query response has no result object")
        run = result.get("run")
        status = run.get("status") if isinstance(run, Mapping) else None
        if status != "STARTED":
            return result
        if attempt + 1 < POLL_ATTEMPTS:
            time.sleep(POLL_DELAY_SECONDS)
    raise TelemetryError("Cloudflare query did not complete within the local polling window")


def raw_events(result: Mapping[str, Any]) -> list[Mapping[str, Any]]:
    """Return event objects from a Workers Observability result."""
    block = result.get("events")
    if not isinstance(block, Mapping):
        return []
    events = block.get("events")
    if not isinstance(events, Sequence) or isinstance(events, (str, bytes)):
        return []
    return [event for event in events if isinstance(event, Mapping)]


def flatten_mapping(
    value: Mapping[str, Any], *, prefix: str = "", depth: int = 0
) -> dict[str, Any]:
    """Flatten Cloudflare's nested representation of dotted OTEL attributes."""
    if depth > 8:
        return {}
    flattened: dict[str, Any] = {}
    for raw_key, nested in value.items():
        if not isinstance(raw_key, str):
            continue
        key = f"{prefix}.{raw_key}" if prefix else raw_key
        if isinstance(nested, Mapping):
            flattened.update(flatten_mapping(nested, prefix=key, depth=depth + 1))
        else:
            flattened[key] = nested
    return flattened


def find_observation(value: Any, *, depth: int = 0) -> Mapping[str, Any] | None:
    """Locate and normalize a structured workflow observation in a bounded wrapper."""
    if depth > 5:
        return None
    if isinstance(value, Mapping):
        flattened = flatten_mapping(value)
        if "deos.workflow.correlation_id" in flattened and "deos.workflow.stage" in flattened:
            return flattened
        for nested in value.values():
            found = find_observation(nested, depth=depth + 1)
            if found is not None:
                return found
    elif isinstance(value, Sequence) and not isinstance(value, (str, bytes)):
        for nested in value:
            found = find_observation(nested, depth=depth + 1)
            if found is not None:
                return found
    return None


def sanitize_event(event: Mapping[str, Any]) -> dict[str, str | int]:
    """Extract only approved workflow fields from a raw Cloudflare event."""
    observation = find_observation(event.get("source"))
    if observation is None:
        return {}
    sanitized: dict[str, str | int] = {}
    for key in OBSERVATION_KEYS:
        value = observation.get(key)
        if isinstance(value, (str, int)) and not isinstance(value, bool):
            sanitized[key] = value
    if "event.time" not in sanitized:
        timestamp = event.get("timestamp")
        if isinstance(timestamp, (int, float)) and not isinstance(timestamp, bool):
            sanitized["event.time"] = (
                datetime.fromtimestamp(timestamp / 1000, UTC).isoformat().replace("+00:00", "Z")
            )
    if "service.name" not in sanitized:
        metadata = event.get("$metadata")
        service = metadata.get("service") if isinstance(metadata, Mapping) else None
        if isinstance(service, str):
            sanitized["service.name"] = service
    return sanitized


def sanitized_events(result: Mapping[str, Any]) -> list[dict[str, str | int]]:
    """Sanitize and chronologically order all workflow observations."""
    events = [sanitized for event in raw_events(result) if (sanitized := sanitize_event(event))]
    return sorted(events, key=lambda item: str(item.get("event.time", "")))


def correlations_for_issue(events: Sequence[Mapping[str, str | int]], issue_id: str) -> set[str]:
    """Return exact correlations associated with an internal Linear issue UUID."""
    return {
        correlation
        for event in events
        if event.get("linear.issue.id") == issue_id
        and isinstance((correlation := event.get("deos.workflow.correlation_id")), str)
        and correlation.startswith(CORRELATION_PREFIX)
    }


def correlations_for_project(
    events: Sequence[Mapping[str, str | int]], project_id: str
) -> set[str]:
    """Return correlations observed for a Linear project in a narrow window."""
    return {
        correlation
        for event in events
        if event.get("linear.project.id") == project_id
        and isinstance((correlation := event.get("deos.workflow.correlation_id")), str)
        and correlation.startswith(CORRELATION_PREFIX)
    }


def require_single_correlation(correlations: set[str], *, window: str) -> str:
    """Select exactly one correlation without guessing across candidates."""
    if not correlations:
        raise TelemetryError(f"no retained workflow telemetry found in {window}")
    if len(correlations) > 1:
        candidates = ", ".join(sorted(correlations))
        raise TelemetryError(
            "multiple workflow correlations matched the discovery window; "
            f"refusing to guess. Candidates: {candidates}"
        )
    return next(iter(correlations))


def format_table(events: Sequence[Mapping[str, str | int]]) -> str:
    """Format an operator-oriented event timeline."""
    headers = ("TIME", "SERVICE", "STAGE", "OUTCOME", "ATTEMPT", "TRANSITION", "ERROR")
    rows: list[tuple[str, ...]] = []
    for event in events:
        previous = str(event.get("deos.workflow.previous_state", ""))
        following = str(event.get("deos.workflow.next_state", ""))
        transition = f"{previous} -> {following}" if previous or following else "-"
        rows.append(
            (
                str(event.get("event.time", "-")),
                str(event.get("service.name", "-")),
                str(event.get("deos.workflow.stage", "-")),
                str(event.get("deos.workflow.outcome", "-")),
                str(event.get("deos.workflow.attempt.number", "-")),
                transition,
                str(event.get("error.type", "-")),
            )
        )
    widths = [len(header) for header in headers]
    for row in rows:
        widths = [max(width, len(value)) for width, value in zip(widths, row, strict=True)]
    lines = [" | ".join(value.ljust(width) for value, width in zip(headers, widths, strict=True))]
    lines.append("-+-".join("-" * width for width in widths))
    lines.extend(
        " | ".join(value.ljust(width) for value, width in zip(row, widths, strict=True))
        for row in rows
    )
    return "\n".join(lines)


def output_result(
    *,
    issue_key: str,
    issue_id: str | None,
    correlation_id: str,
    start: datetime,
    end: datetime,
    events: Sequence[Mapping[str, str | int]],
    as_json: bool,
) -> None:
    """Print either a sanitized JSON document or the operator table."""
    delivery_ids = sorted(
        {value for event in events if isinstance((value := event.get("linear.delivery.id")), str)}
    )
    message_ids = sorted(
        {value for event in events if isinstance((value := event.get("messaging.message.id")), str)}
    )
    if as_json:
        print(
            json.dumps(
                {
                    "issue_key": issue_key,
                    "issue_id": issue_id,
                    "correlation_id": correlation_id,
                    "from": start.isoformat().replace("+00:00", "Z"),
                    "to": end.isoformat().replace("+00:00", "Z"),
                    "delivery_ids": delivery_ids,
                    "queue_message_ids": message_ids,
                    "events": list(events),
                },
                indent=2,
                sort_keys=True,
            )
        )
        return
    print(f"Linear issue: {issue_key}")
    if issue_id is not None:
        print(f"Linear issue UUID: {issue_id}")
    print(f"Correlation ID: {correlation_id}")
    print(f"Delivery IDs: {', '.join(delivery_ids) if delivery_ids else '-'}")
    print(f"Queue message IDs: {', '.join(message_ids) if message_ids else '-'}")
    print(
        "UTC window: "
        f"{start.isoformat().replace('+00:00', 'Z')} -> "
        f"{end.isoformat().replace('+00:00', 'Z')}"
    )
    print(f"Events: {len(events)}")
    print()
    print(format_table(events))


def parser() -> argparse.ArgumentParser:
    """Build the command-line parser."""
    command = argparse.ArgumentParser(
        description="List correlated deos workflow observations for one Linear issue."
    )
    command.add_argument("--issue-key", required=True, help="Human Linear key, for example SAC-87")
    exact = command.add_argument_group("exact issue lookup")
    exact.add_argument("--issue-id", help="Internal Linear issue UUID when available")
    discovery = command.add_argument_group("project/time discovery")
    discovery.add_argument("--project-id", help="Linear project UUID returned by Linear MCP")
    discovery.add_argument("--event-time", help="Exact admitted-state transition timestamp")
    command.add_argument(
        "--env-file", type=Path, default=Path(".env"), help="Ignored dotenv file (default: .env)"
    )
    command.add_argument(
        "--wrangler-config",
        type=Path,
        default=Path("wrangler.jsonc"),
        help="Wrangler config containing account_id (default: wrangler.jsonc)",
    )
    command.add_argument(
        "--timeline-hours",
        type=float,
        default=168.0,
        help="Hours after admission to include in the final timeline (default: 168)",
    )
    command.add_argument("--limit", type=int, default=500, help="Maximum events per query")
    command.add_argument("--timeout", type=float, default=30.0, help="HTTP timeout in seconds")
    command.add_argument("--json", action="store_true", help="Emit sanitized JSON")
    return command


def run(arguments: argparse.Namespace) -> None:
    """Resolve the correlation and emit its full retained timeline."""
    issue_key = arguments.issue_key.upper()
    if not ISSUE_KEY_RE.fullmatch(issue_key):
        raise TelemetryError("issue key must look like SAC-87")
    if not 0 < arguments.timeline_hours <= 168:
        raise TelemetryError("--timeline-hours must be between 0 and 168")
    if arguments.timeout <= 0:
        raise TelemetryError("--timeout must be positive")

    issue_id: str | None = arguments.issue_id
    event_time: datetime | None = None
    if issue_id is not None:
        try:
            issue_id = str(UUID(issue_id))
        except ValueError as exc:
            raise TelemetryError("--issue-id must be a UUID") from exc
        now = datetime.now(UTC)
        discovery_start = now - timedelta(hours=min(arguments.timeline_hours, 168.0))
        discovery_end = now
        discovery_needle = issue_id
    else:
        if not arguments.project_id or not arguments.event_time:
            raise TelemetryError(
                "provide --issue-id, or provide both --project-id and --event-time from Linear MCP"
            )
        try:
            project_id = str(UUID(arguments.project_id))
        except ValueError as exc:
            raise TelemetryError("--project-id must be a UUID") from exc
        event_time = parse_timestamp(arguments.event_time)
        discovery_start = event_time - timedelta(minutes=DISCOVERY_MINUTES)
        discovery_end = event_time + timedelta(minutes=DISCOVERY_MINUTES)
        discovery_needle = project_id

    account_id, api_token = load_credentials(arguments.env_file, arguments.wrangler_config)
    discovery_result = post_query(
        account_id=account_id,
        api_token=api_token,
        query=build_query(discovery_needle, discovery_start, discovery_end, limit=arguments.limit),
        timeout=arguments.timeout,
    )
    discovered_events = sanitized_events(discovery_result)
    if issue_id is not None:
        correlations = correlations_for_issue(discovered_events, issue_id)
    else:
        correlations = correlations_for_project(discovered_events, project_id)
    window = f"UTC window {discovery_start.isoformat()} to {discovery_end.isoformat()}"
    correlation_id = require_single_correlation(correlations, window=window)

    if event_time is None:
        timeline_start = discovery_start
        timeline_end = discovery_end
    else:
        timeline_start = event_time - timedelta(minutes=DISCOVERY_MINUTES)
        timeline_end = min(
            datetime.now(UTC), event_time + timedelta(hours=arguments.timeline_hours)
        )
    timeline_result = post_query(
        account_id=account_id,
        api_token=api_token,
        query=build_query(correlation_id, timeline_start, timeline_end, limit=arguments.limit),
        timeout=arguments.timeout,
    )
    events = [
        event
        for event in sanitized_events(timeline_result)
        if event.get("deos.workflow.correlation_id") == correlation_id
    ]
    if not events:
        raise TelemetryError(
            "the correlation was discovered, but no retained events matched the timeline query"
        )
    output_result(
        issue_key=issue_key,
        issue_id=issue_id,
        correlation_id=correlation_id,
        start=timeline_start,
        end=timeline_end,
        events=events,
        as_json=arguments.json,
    )


def main() -> int:
    """CLI entry point."""
    try:
        run(parser().parse_args())
    except TelemetryError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
