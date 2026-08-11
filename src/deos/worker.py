"""Cloudflare Worker composition root.

The binding-specific fetch adapter is intentionally deferred to the deployment
task. This module defines the composition boundary so the Worker can receive
Cloudflare bindings without coupling domain ports to provider SDK types.
"""

from __future__ import annotations

from dataclasses import dataclass

from .ports import ArtifactStore, IngressPort, QueuePort, StatePort, TelemetryPort


@dataclass(frozen=True, slots=True)
class WorkerDependencies:
    ingress: IngressPort
    queue: QueuePort
    state: StatePort
    telemetry: TelemetryPort
    artifacts: ArtifactStore


class Worker:
    """Dependency-injected Worker boundary used by the future fetch adapter."""

    def __init__(self, dependencies: WorkerDependencies) -> None:
        self.dependencies = dependencies

