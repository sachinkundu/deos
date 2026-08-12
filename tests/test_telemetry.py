import json
from datetime import UTC, datetime

import pytest

from deos.telemetry import emit_otel_event, otel_event

NOW = datetime(2026, 8, 12, 12, 0, tzinfo=UTC)


def test_otel_event_has_stable_correlation_and_event_fields() -> None:
    event = otel_event(
        "deos.ingress.accepted",
        service_name="deos-sample-project",
        correlation_id="delivery-1",
        timestamp=NOW,
        attributes={"deos.issue.id": "issue-1"},
    )

    assert event["EventName"] == "deos.ingress.accepted"
    assert event["Timestamp"] == "2026-08-12T12:00:00+00:00"
    assert event["Resource"] == {"service.name": "deos-sample-project"}
    assert event["Attributes"] == {
        "deos.correlation.id": "delivery-1",
        "deos.issue.id": "issue-1",
    }


def test_emitted_event_is_compact_structured_json(capsys: pytest.CaptureFixture[str]) -> None:
    emit_otel_event(
        "deos.ingress.rejected",
        service_name="deos-sample-project",
        correlation_id="delivery-2",
        timestamp=NOW,
        severity_number=13,
        severity_text="WARN",
    )

    event = json.loads(capsys.readouterr().out)
    assert event["SeverityNumber"] == 13
    assert event["SeverityText"] == "WARN"
    assert event["Attributes"]["deos.correlation.id"] == "delivery-2"
