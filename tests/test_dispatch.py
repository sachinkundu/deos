from dataclasses import replace
from datetime import UTC, datetime

import pytest

from deos.dispatch import InvalidTransition, WorkflowDispatcher
from deos.fakes import FakeStateStore, FakeTelemetry
from deos.ports import ApplicationEvent, WorkflowState

NOW = datetime(2026, 8, 12, 10, 0, tzinfo=UTC)


def event() -> ApplicationEvent:
    return ApplicationEvent(
        "event-1", "delivery-1", "issue-1", "project-1", "In Progress", "actor-1", NOW
    )


def test_dispatch_reaches_human_approval_and_is_idempotent() -> None:
    state = FakeStateStore()
    telemetry = FakeTelemetry()
    dispatcher = WorkflowDispatcher(state, telemetry, lambda: NOW)

    first = dispatcher.dispatch(event())
    duplicate = dispatcher.dispatch(event())

    assert first.current_state == WorkflowState.AWAITING_HUMAN_APPROVAL
    assert duplicate == first
    assert [transition.next for transition in state.transitions] == [
        WorkflowState.QUEUED,
        WorkflowState.REQUIREMENTS_IN_PROGRESS,
        WorkflowState.AWAITING_HUMAN_APPROVAL,
    ]
    correlated = [item for item in telemetry.events if item[0] != "deos.workflow.run.reused"]
    assert {item[1] for item in correlated} == {"event-1"}
    assert [item[0] for item in correlated] == [
        "deos.workflow.run.created",
        "deos.workflow.transition",
        "deos.workflow.transition",
        "deos.workflow.transition",
    ]


def test_approval_requires_explicit_actor_action() -> None:
    state = FakeStateStore()
    telemetry = FakeTelemetry()
    dispatcher = WorkflowDispatcher(state, telemetry, lambda: NOW)
    run = dispatcher.dispatch(event())

    assert run.current_state == WorkflowState.AWAITING_HUMAN_APPROVAL
    assert state.transitions[-1].actor_id == "actor-1"

    with pytest.raises(InvalidTransition):
        dispatcher._transition(
            replace(run, current_state=WorkflowState.RECEIVED),
            WorkflowState.APPROVED,
            "automation",
            None,
            NOW,
        )

    approved = dispatcher.approve(run.run_id, "human-1", NOW)
    assert approved.current_state == WorkflowState.APPROVED
    assert state.transitions[-1].actor_id == "human-1"
    assert telemetry.events[-1][1] == "event-1"
