"""OpenTelemetry-compatible structured workflow events."""

from __future__ import annotations

import json
from collections.abc import Mapping
from datetime import datetime
from typing import TypeAlias

TelemetryValue: TypeAlias = str | bool | int | float


def otel_event(
    name: str,
    *,
    service_name: str,
    correlation_id: str,
    timestamp: datetime,
    attributes: Mapping[str, TelemetryValue] | None = None,
    severity_number: int = 9,
    severity_text: str = "INFO",
) -> dict[str, object]:
    """Build an event that maps directly onto the OTEL Log Data Model."""
    event_attributes: dict[str, TelemetryValue] = {
        "deos.correlation.id": correlation_id,
    }
    if attributes is not None:
        event_attributes.update(attributes)
    event_time = timestamp.isoformat()
    return {
        "Timestamp": event_time,
        "ObservedTimestamp": event_time,
        "SeverityNumber": severity_number,
        "SeverityText": severity_text,
        "Body": name,
        "EventName": name,
        "Resource": {"service.name": service_name},
        "Attributes": event_attributes,
    }


def emit_otel_event(
    name: str,
    *,
    service_name: str,
    correlation_id: str,
    timestamp: datetime,
    attributes: Mapping[str, TelemetryValue] | None = None,
    severity_number: int = 9,
    severity_text: str = "INFO",
) -> None:
    """Write one compact JSON event for Workers Logs and OTLP export."""
    print(
        json.dumps(
            otel_event(
                name,
                service_name=service_name,
                correlation_id=correlation_id,
                timestamp=timestamp,
                attributes=attributes,
                severity_number=severity_number,
                severity_text=severity_text,
            ),
            separators=(",", ":"),
            sort_keys=True,
        )
    )
