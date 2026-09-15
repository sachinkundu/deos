## ADDED Requirements

### Requirement: Signal task progress in the Author node

The implementation phase SHALL contain one Author node linked to Human Review. A compact meter SHALL show the author's checked tasks, total tasks, remaining tasks, and the last observed time. It SHALL keep the existing phase markers, status, and transcript controls. It MUST NOT add internal task or proof panels to the workflow map. Selecting the task counter SHALL open a read-only popup with OpenSpec sections, numbered tasks, and checked or unchecked states. Its counts and task text SHALL come from the same saved observation. The popup SHALL support keyboard dismissal and a narrow viewport.

#### Scenario: Person opens the task checklist

- **WHEN** a person selects the Author task counter.
- **THEN** the portal loads a popup with the matching checklist, completed and remaining counts, and filters for all, remaining, or done tasks. The person cannot change task state through the popup.

Checklist edits SHALL signal the current workflow through the attempt's scoped capability. The workflow SHALL read the actual checklist before saving counts. A signal MUST NOT carry a completion result or choose a human gate. The heartbeat SHALL reconcile missed signals as a fallback.

#### Scenario: The author checks off a task

- **WHEN** the active author saves a changed task checklist, including an atomic file replacement.
- **THEN** a progress signal wakes the workflow, which reads and saves that attempt's counts for the portal.

#### Scenario: All tasks are checked but the run is active

- **WHEN** the author marks all tasks complete while the workflow still has work to verify.
- **THEN** the meter shows no remaining checklist tasks and says that final checks are still in progress. The human gate remains controlled by the workflow.

#### Scenario: Progress cannot be refreshed

- **WHEN** a progress read fails or an old attempt sends a late signal.
- **THEN** the original error is retained or the old signal is rejected. No count is invented. The view shows the observation time and marks delayed updates. A fresh try does not inherit a prior try's live counter.

### Requirement: Show implementation progress and proof

The portal SHALL show implementation progress through the Author node and link the final pull request from Human Review. The pull request and its linked evidence SHALL retain the checked design base, build tries, task state, branch, checks, and proof. Each proof item SHALL be marked as an image, a Showboat log, a real host event, or a fake event. Unit tests MUST NOT be the sole proof of how the app acts.

The linked evidence SHALL show which change and approved base each proof item covers. Old proof SHALL stay in the past. It MUST NOT look like proof for new work. The workflow SHALL keep the final gate blocked while any needed proof is stale.

#### Scenario: Implementation is active

- **WHEN** a person opens a run while the build is in flight.
- **THEN** the portal shows Author as active with its checklist meter, status, and existing transcript controls.

#### Scenario: Pull request is ready

- **WHEN** the build enters its final human gate.
- **THEN** the shared Human Review node links the exact pull request, which contains check results, the task list, and current behavior proof.

#### Scenario: Work changes after proof

- **WHEN** an edit changes the patch after proof was saved.
- **THEN** the workflow marks the affected proof as stale and keeps the final gate blocked until the current work has new proof.

### Requirement: Show clarification waits and replies

The portal SHALL show a build question as a wait in the build stage. It SHALL show the open question and why it stopped safe work. It SHALL show the allowed reply and the fresh try. It MUST NOT show this wait as the final review.

#### Scenario: Implementation waits for a reply

- **WHEN** the flow has posted an open build question.
- **THEN** the portal shows that the run waits for a reply and links the Linear question.

#### Scenario: Allowed reply resumes work

- **WHEN** the allowed human account answers the open question.
- **THEN** the portal links the reply to the new try and shows the build as live again.

#### Scenario: Untrusted reply is ignored

- **WHEN** DEOS receives a reply that cannot answer the gate.
- **THEN** the portal keeps the run on hold and shows a safe reason with no private text.

### Requirement: Keep implementation and release states distinct

The portal SHALL end this flow at build review or code merge. It MUST NOT call either state deployed, released, or live. Only a new release flow can prove that state.

#### Scenario: Code pull request is merged

- **WHEN** the code pull request merges with no new release act.
- **THEN** the portal shows the code as merged and the live release as not begun.
