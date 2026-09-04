#!/usr/bin/env python3
"""Read-only audit of historical DEOS Cloudflare container demand."""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import tomllib
from collections import Counter, defaultdict
from collections.abc import Iterable, Mapping, Sequence
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

GRAPHQL_URL = "https://api.cloudflare.com/client/v4/graphql"
GRAPHQL_LIMIT = 10_000
ACCOUNT_ID_RE = re.compile(r'"account_id"\s*:\s*"([0-9a-fA-F]{32})"')
WORKER_NAME_RE = re.compile(r'"name"\s*:\s*"([^"\n]+)"')
MAX_INSTANCES_RE = re.compile(r'"max_instances"\s*:\s*(\d+)')
WORKFLOW_NAME_RE = re.compile(
    r'"workflows"\s*:\s*\[.*?"name"\s*:\s*"([^"\n]+)"', re.DOTALL
)
ANSI_RE = re.compile(r"\x1b\[[0-?]*[ -/]*[@-~]")
CAPACITY_RE = re.compile(
    r"capacity|maximum.{0,30}instance|max_instances|instance.{0,20}limit|"
    r"too many.{0,30}(?:container|instance)|no.{0,30}available.{0,20}instance|"
    r"(?:provision|container).{0,30}(?:timed? out|unavailable|exhausted)",
    re.IGNORECASE,
)
ATTEMPT_SQL = """
SELECT a.attempt_id, a.run_id, a.node_id, a.state, a.created_at, a.started_at,
       a.ended_at, a.updated_at, a.result_class, a.result_detail,
       COALESCE(stage_retry.source_workflow_instance_id,
                runtime_recovery.source_workflow_instance_id,
                r.workflow_instance_id) AS attempt_workflow_instance_id
FROM agent_attempts AS a
LEFT JOIN orchestration_runs AS r ON r.run_id = a.run_id
LEFT JOIN agent_stage_retries AS stage_retry
  ON stage_retry.run_id = a.run_id
 AND stage_retry.from_visit_sequence = a.visit_sequence
LEFT JOIN workflow_runtime_recoveries AS runtime_recovery
  ON runtime_recovery.run_id = a.run_id
 AND runtime_recovery.from_visit_sequence = a.visit_sequence
ORDER BY a.created_at
""".strip()


class AuditError(RuntimeError):
    """Expected operator-facing failure without secret-bearing context."""


def parse_iso(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.strip())
    if parsed.tzinfo is None:
        # D1's legacy rows use SQLite UTC timestamps without an explicit suffix.
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def iso(value: datetime) -> str:
    return value.astimezone(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def config_values(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise AuditError(f"Wrangler config does not exist: {path}")
    source = path.read_text(encoding="utf-8")
    account = ACCOUNT_ID_RE.search(source)
    worker = WORKER_NAME_RE.search(source)
    maximum = MAX_INSTANCES_RE.search(source)
    workflow = WORKFLOW_NAME_RE.search(source)
    if not account or not worker or not maximum:
        raise AuditError("Wrangler config is missing account_id, name, or max_instances")
    return {
        "account_id": account.group(1),
        "worker_name": worker.group(1),
        "max_instances": int(maximum.group(1)),
        "workflow_name": workflow.group(1) if workflow else None,
    }


def parse_dotenv(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    allowed = {"CLOUDFLARE_API_TOKEN", "CLOUDFLARE_TOKEN"}
    values: dict[str, str] = {}
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line.removeprefix("export ").lstrip()
        key, separator, value = line.partition("=")
        if not separator or key.strip() not in allowed:
            continue
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
            value = value[1:-1]
        values[key.strip()] = value
    return values


def wrangler_oauth_token() -> str | None:
    candidates = (
        Path.home() / "Library/Preferences/.wrangler/config/default.toml",
        Path.home() / ".config/.wrangler/config/default.toml",
    )
    for path in candidates:
        if not path.exists():
            continue
        try:
            value = tomllib.loads(path.read_text(encoding="utf-8")).get("oauth_token")
        except (OSError, tomllib.TOMLDecodeError):
            continue
        if isinstance(value, str) and value:
            return value
    return None


def api_token(env_file: Path) -> str:
    file_values = parse_dotenv(env_file)
    token = (
        os.environ.get("CLOUDFLARE_API_TOKEN")
        or os.environ.get("CLOUDFLARE_TOKEN")
        or file_values.get("CLOUDFLARE_API_TOKEN")
        or file_values.get("CLOUDFLARE_TOKEN")
        or wrangler_oauth_token()
    )
    if not token:
        raise AuditError(
            "missing Cloudflare credential: set CLOUDFLARE_API_TOKEN or log in with Wrangler"
        )
    return token


def command_json(command: Sequence[str]) -> Any:
    completed = subprocess.run(command, check=False, capture_output=True, text=True)
    if completed.returncode != 0:
        sanitized = ANSI_RE.sub("", completed.stderr or completed.stdout).strip().splitlines()
        detail = next((line.strip() for line in sanitized if "ERROR" in line), "command failed")
        raise AuditError(detail[:240])
    try:
        return json.loads(completed.stdout)
    except json.JSONDecodeError as exc:
        raise AuditError("command returned non-JSON output") from exc


def d1_attempts(config: Path, database: str) -> list[dict[str, Any]]:
    payload = command_json(
        [
            "npx",
            "wrangler",
            "d1",
            "execute",
            database,
            "--remote",
            "--config",
            str(config),
            "--command",
            ATTEMPT_SQL,
            "--json",
        ]
    )
    if not isinstance(payload, list) or not payload:
        raise AuditError("D1 returned an unexpected response")
    rows = payload[0].get("results") if isinstance(payload[0], Mapping) else None
    if not isinstance(rows, list):
        raise AuditError("D1 response has no results")
    return [dict(row) for row in rows if isinstance(row, Mapping)]


def container_application(config: Path, expected_name: str) -> dict[str, Any]:
    payload = command_json(
        ["npx", "wrangler", "containers", "list", "--json", "--config", str(config)]
    )
    if not isinstance(payload, list):
        raise AuditError("container list returned an unexpected response")
    matches = [item for item in payload if isinstance(item, Mapping) and item.get("name") == expected_name]
    if len(matches) != 1:
        raise AuditError(f"expected one container application named {expected_name}, found {len(matches)}")
    return dict(matches[0])


def peak_overlap(
    rows: Iterable[Mapping[str, Any]], *, start_key: str
) -> tuple[int, datetime | None]:
    events: list[tuple[datetime, int]] = []
    now = datetime.now(UTC)
    for row in rows:
        start_value = row.get(start_key)
        if not isinstance(start_value, str) or not start_value:
            continue
        end_value = row.get("ended_at")
        start = parse_iso(start_value)
        if isinstance(end_value, str) and end_value:
            end = parse_iso(end_value)
        elif row.get("state") in {"pending", "starting", "running"}:
            end = now
        else:
            updated_value = row.get("updated_at")
            end = (
                parse_iso(updated_value)
                if isinstance(updated_value, str) and updated_value
                else now
            )
        if end < start:
            continue
        events.extend(((start, 1), (end, -1)))
    active = 0
    peak = 0
    peak_at: datetime | None = None
    for at, delta in sorted(events, key=lambda item: (item[0], item[1])):
        active += delta
        if active > peak:
            peak = active
            peak_at = at
    return peak, peak_at


def start_delays(rows: Iterable[Mapping[str, Any]]) -> tuple[float | None, str | None]:
    candidates: list[tuple[float, str]] = []
    for row in rows:
        created = row.get("created_at")
        started = row.get("started_at")
        if not isinstance(created, str) or not isinstance(started, str) or not started:
            continue
        seconds = (parse_iso(started) - parse_iso(created)).total_seconds()
        candidates.append((seconds, str(row.get("attempt_id") or "unknown")))
    return max(candidates) if candidates else (None, None)


def graphql_window(
    *, account_id: str, token: str, application_id: str, start: datetime, end: datetime
) -> list[dict[str, Any]]:
    query = """
query ContainerLoad($accountTag: String!, $limit: Int!, $filter: AccountContainersMetricsAdaptiveGroupsFilter_InputObject!) {
  viewer {
    accounts(filter: {accountTag: $accountTag}) {
      containersMetricsAdaptiveGroups(limit: $limit, filter: $filter, orderBy: [datetimeMinute_ASC]) {
        dimensions { datetimeMinute instanceId applicationId }
      }
    }
  }
}
""".strip()
    body = json.dumps(
        {
            "query": query,
            "variables": {
                "accountTag": account_id,
                "limit": GRAPHQL_LIMIT,
                "filter": {
                    "applicationId": application_id,
                    "datetime_geq": iso(start),
                    "datetime_lt": iso(end),
                },
            },
        }
    ).encode("utf-8")
    request = Request(
        GRAPHQL_URL,
        data=body,
        method="POST",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
    )
    try:
        with urlopen(request, timeout=30) as response:
            payload = json.load(response)
    except HTTPError as exc:
        raise AuditError(f"Cloudflare analytics query failed with HTTP {exc.code}") from exc
    except URLError as exc:
        raise AuditError("Cloudflare analytics query could not reach the API") from exc
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise AuditError("Cloudflare analytics returned non-JSON output") from exc
    if not isinstance(payload, Mapping) or payload.get("errors"):
        raise AuditError("Cloudflare analytics returned an unsuccessful response")
    try:
        rows = payload["data"]["viewer"]["accounts"][0]["containersMetricsAdaptiveGroups"]
    except (KeyError, IndexError, TypeError) as exc:
        raise AuditError("Cloudflare analytics response has no container rows") from exc
    if not isinstance(rows, list):
        raise AuditError("Cloudflare analytics container rows are malformed")
    return [dict(row) for row in rows if isinstance(row, Mapping)]


def graphql_rows(
    *, account_id: str, token: str, application_id: str, start: datetime, end: datetime
) -> list[dict[str, Any]]:
    def collect(window_start: datetime, window_end: datetime) -> list[dict[str, Any]]:
        rows = graphql_window(
            account_id=account_id,
            token=token,
            application_id=application_id,
            start=window_start,
            end=window_end,
        )
        if len(rows) < GRAPHQL_LIMIT:
            return rows
        if window_end - window_start <= timedelta(minutes=1):
            raise AuditError("Cloudflare analytics reached its row limit within one minute")
        midpoint = window_start + (window_end - window_start) / 2
        return collect(window_start, midpoint) + collect(midpoint, window_end)

    all_rows: list[dict[str, Any]] = []
    cursor = start
    while cursor < end:
        chunk_end = min(cursor + timedelta(days=7), end)
        all_rows.extend(collect(cursor, chunk_end))
        cursor = chunk_end
    return all_rows


def minute_peak(rows: Iterable[Mapping[str, Any]]) -> tuple[int, str | None]:
    instances: dict[str, set[str]] = defaultdict(set)
    for row in rows:
        dimensions = row.get("dimensions")
        if not isinstance(dimensions, Mapping):
            continue
        minute = dimensions.get("datetimeMinute")
        instance = dimensions.get("instanceId")
        if isinstance(minute, str) and isinstance(instance, str):
            instances[minute].add(instance)
    if not instances:
        return 0, None
    maximum = max(len(values) for values in instances.values())
    at = min(minute for minute, values in instances.items() if len(values) == maximum)
    return maximum, at


def workflow_capacity_check(
    rows: Iterable[Mapping[str, Any]], *, config: Path, workflow_name: str | None
) -> tuple[int, list[str], int]:
    startup = [
        row
        for row in rows
        if row.get("result_class") == "startup_failed"
        and row.get("attempt_workflow_instance_id")
    ]
    if not startup or not workflow_name:
        return 0, [], 0
    matches: list[str] = []
    checked = 0
    for row in startup:
        completed = subprocess.run(
            [
                "npx",
                "wrangler",
                "workflows",
                "instances",
                "describe",
                workflow_name,
                str(row["attempt_workflow_instance_id"]),
                "--config",
                str(config),
                "--truncate-output-limit",
                "1000",
            ],
            check=False,
            capture_output=True,
            text=True,
        )
        if completed.returncode != 0:
            continue
        checked += 1
        sanitized = ANSI_RE.sub("", completed.stdout + "\n" + completed.stderr)
        error_lines = "\n".join(line for line in sanitized.splitlines() if "error" in line.lower())
        if CAPACITY_RE.search(error_lines):
            matches.append(str(row.get("attempt_id") or "unknown"))
    return len(startup), matches, checked


def audit(arguments: argparse.Namespace) -> dict[str, Any]:
    config = arguments.config.resolve()
    values = config_values(config)
    attempts = d1_attempts(config, arguments.database)
    if not attempts:
        raise AuditError("D1 contains no agent attempts")
    application = container_application(config, arguments.application_name or f"{values['worker_name']}-sandbox")
    app_id = application.get("id")
    if not isinstance(app_id, str):
        raise AuditError("container application has no ID")
    created_values = [parse_iso(row["created_at"]) for row in attempts if row.get("created_at")]
    start = min(created_values)
    end = datetime.now(UTC)
    metrics = graphql_rows(
        account_id=values["account_id"],
        token=api_token(arguments.env_file),
        application_id=app_id,
        start=start,
        end=end,
    )
    allocated_peak, allocated_at = peak_overlap(attempts, start_key="created_at")
    running_peak, running_at = peak_overlap(attempts, start_key="started_at")
    provider_peak, provider_at = minute_peak(metrics)
    delay_seconds, delay_attempt = start_delays(attempts)
    durable_capacity_matches = [
        str(row.get("attempt_id") or "unknown")
        for row in attempts
        if CAPACITY_RE.search(str(row.get("result_detail") or ""))
    ]
    startup_total = sum(row.get("result_class") == "startup_failed" for row in attempts)
    workflow_matches: list[str] = []
    workflow_checked = 0
    if arguments.check_workflow_errors:
        startup_total, workflow_matches, workflow_checked = workflow_capacity_check(
            attempts, config=config, workflow_name=values["workflow_name"]
        )
    result_classes = Counter(
        str(row["result_class"]) for row in attempts if row.get("result_class")
    )
    return {
        "window": {"from": iso(start), "to": iso(end)},
        "configured_max_instances": values["max_instances"],
        "container_application": {
            "id": app_id,
            "name": application.get("name"),
            "state": application.get("state"),
            "reported_instances": application.get("instances"),
        },
        "d1": {
            "attempt_count": len(attempts),
            "allocated_peak": allocated_peak,
            "allocated_peak_at": iso(allocated_at) if allocated_at else None,
            "running_peak": running_peak,
            "running_peak_at": iso(running_at) if running_at else None,
            "largest_start_delay_seconds": round(delay_seconds, 3) if delay_seconds is not None else None,
            "largest_start_delay_attempt_id": delay_attempt,
            "result_classes": dict(sorted(result_classes.items())),
            "durable_capacity_failure_matches": durable_capacity_matches,
        },
        "cloudflare_analytics": {
            "minute_peak": provider_peak,
            "minute_peak_at": provider_at,
            "metric_rows": len(metrics),
        },
        "workflow_error_check": {
            "requested": arguments.check_workflow_errors,
            "startup_failures": startup_total,
            "instances_checked": workflow_checked,
            "capacity_failure_matches": workflow_matches,
        },
        "capacity_queue_field_available": False,
    }


def render(result: Mapping[str, Any]) -> str:
    d1 = result["d1"]
    analytics = result["cloudflare_analytics"]
    workflow = result["workflow_error_check"]
    durable_matches = d1["durable_capacity_failure_matches"]
    workflow_matches = workflow["capacity_failure_matches"]
    lines = [
        "Cloudflare container load audit",
        f"Window: {result['window']['from']} to {result['window']['to']}",
        f"Configured maximum: {result['configured_max_instances']}",
        f"D1 allocated peak: {d1['allocated_peak']} at {d1['allocated_peak_at']}",
        f"D1 running peak: {d1['running_peak']} at {d1['running_peak_at']}",
        f"Cloudflare minute peak: {analytics['minute_peak']} at {analytics['minute_peak_at']}",
        f"Largest recorded create-to-start delay: {d1['largest_start_delay_seconds']} seconds",
        f"Durable capacity failure matches: {len(durable_matches)}",
    ]
    if workflow["requested"]:
        lines.append(
            "Workflow startup errors checked: "
            f"{workflow['instances_checked']}/{workflow['startup_failures']}"
        )
        lines.append(f"Workflow capacity failure matches: {len(workflow_matches)}")
    else:
        lines.append("Workflow startup errors checked: not requested")
    lines.append("Dedicated capacity-queue field: unavailable")
    return "\n".join(lines)


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description=__doc__)
    result.add_argument("--config", type=Path, default=Path("wrangler.queue-consumer-ts.jsonc"))
    result.add_argument("--database", default="DB")
    result.add_argument("--application-name")
    result.add_argument("--env-file", type=Path, default=Path(".env"))
    result.add_argument("--check-workflow-errors", action="store_true")
    result.add_argument("--json", action="store_true")
    return result


def main() -> int:
    arguments = parser().parse_args()
    try:
        result = audit(arguments)
    except (AuditError, OSError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    print(json.dumps(result, indent=2, sort_keys=True) if arguments.json else render(result))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
