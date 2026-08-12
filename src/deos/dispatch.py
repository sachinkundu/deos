"""Durable workflow dispatch and explicit human-approval transitions."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import replace
from datetime import datetime
from uuid import NAMESPACE_URL, uuid5

from .ports import ApplicationEvent, StatePort, Transition, WorkflowRun, WorkflowState


class InvalidTransition(ValueError):
    """Raised when a workflow attempts to skip a required state or approval."""


class WorkflowDispatcher:
    """Apply the first workflow definition to an accepted application event."""

    def __init__(self, state: StatePort, now: Callable[[], datetime]) -> None:
        self._state = state
        self._now = now

    def dispatch(self, event: ApplicationEvent) -> WorkflowRun:
        existing = self._state.get_run(event.project_id, event.issue_id)
        if existing is not None:
            return existing

        now = self._now()
        run = WorkflowRun(
            run_id=str(uuid5(NAMESPACE_URL, f"deos:{event.project_id}:{event.issue_id}")),
            project_id=event.project_id,
            issue_id=event.issue_id,
            current_state=WorkflowState.RECEIVED,
            correlation_id=event.event_id,
            created_at=now,
            updated_at=now,
        )
        if not self._state.create_run(run):
            existing = self._state.get_run(event.project_id, event.issue_id)
            if existing is None:
                raise RuntimeError("workflow run creation raced without a readable run")
            return existing

        for next_state, cause in (
            (WorkflowState.QUEUED, "queue-consumed"),
            (WorkflowState.REQUIREMENTS_IN_PROGRESS, "workflow-started"),
            (WorkflowState.AWAITING_HUMAN_APPROVAL, "approval-required"),
        ):
            run = self._transition(run, next_state, cause, event.actor_id, event.occurred_at)
        return run

    def approve(self, run_id: str, actor_id: str, occurred_at: datetime) -> WorkflowRun:
        return self._resume(run_id, WorkflowState.APPROVED, "human-approved", actor_id, occurred_at)

    def reject(self, run_id: str, actor_id: str, occurred_at: datetime) -> WorkflowRun:
        return self._resume(run_id, WorkflowState.REJECTED, "human-rejected", actor_id, occurred_at)

    def _resume(
        self,
        run_id: str,
        next_state: WorkflowState,
        cause: str,
        actor_id: str,
        occurred_at: datetime,
    ) -> WorkflowRun:
        run = self._find_run(run_id)
        return self._transition(run, next_state, cause, actor_id, occurred_at)

    def _find_run(self, run_id: str) -> WorkflowRun:
        # StatePort intentionally keeps lookup narrow for the first slice.
        # Implementations may index by run id while preserving this contract.
        for state in (WorkflowState.RECEIVED, WorkflowState.QUEUED,
                      WorkflowState.REQUIREMENTS_IN_PROGRESS,
                      WorkflowState.AWAITING_HUMAN_APPROVAL, WorkflowState.APPROVED,
                      WorkflowState.REJECTED):
            run = self._state.find_run(run_id, state)
            if run is not None:
                return run
        raise KeyError(f"unknown workflow run: {run_id}")

    def _transition(
        self,
        run: WorkflowRun,
        next_state: WorkflowState,
        cause: str,
        actor_id: str | None,
        occurred_at: datetime,
    ) -> WorkflowRun:
        allowed = {
            WorkflowState.RECEIVED: {WorkflowState.QUEUED},
            WorkflowState.QUEUED: {WorkflowState.REQUIREMENTS_IN_PROGRESS},
            WorkflowState.REQUIREMENTS_IN_PROGRESS: {WorkflowState.AWAITING_HUMAN_APPROVAL},
            WorkflowState.AWAITING_HUMAN_APPROVAL: {WorkflowState.APPROVED, WorkflowState.REJECTED},
            WorkflowState.APPROVED: set(),
            WorkflowState.REJECTED: set(),
        }
        if next_state not in allowed[run.current_state]:
            raise InvalidTransition(f"{run.current_state} -> {next_state} is not allowed")
        updated = replace(run, current_state=next_state, updated_at=occurred_at)
        self._state.record_transition(
            Transition(run.run_id, run.current_state, next_state, cause, actor_id, occurred_at)
        )
        self._state.update_run(updated)
        return updated
