## Purpose

Let a person finish a review in `BettaView` and start the next step from the same page.

## ADDED Requirements

### Requirement: Bind a review to the open gate

Project setup SHALL bind one checked `Access` account, one numeric `GitHub` user ID, and one `Linear` user ID as the allowed person. A trusted read from each host SHALL prove the IDs. The saved link SHALL have a policy version. Each new run SHALL freeze all three IDs and that version.

`BettaView` SHALL check the `Access` account and the `GitHub` user session for each review. It SHALL make one review record. The record SHALL name the pull request, head, run, open gate, review type, and stable ID.

The web page MUST NOT set trusted user fields. The `BettaView` service SHALL send its checked account and user IDs to `DEOS` through an authenticated call. `DEOS` SHALL check that call and all IDs against the frozen run link. It MUST NOT trust identity data from the page. This check is needed because an `Access` context does not pass through a service binding.

Before a host write, `DEOS` SHALL also check the link from the pull request to the run and gate. It SHALL check that the head is still live. One host login by itself MUST NOT grant access to the task.

#### Scenario: Allowed person is set up

- **WHEN** project setup reads all three host accounts and saves their checked IDs.
- **THEN** it saves one versioned person link that a new run can freeze.

#### Scenario: Linked review is ready

- **WHEN** the allowed person sends a review for the live head and its open gate.
- **THEN** one record binds the review to that run, gate, head, type, and frozen person link.

#### Scenario: Person starts a new session

- **WHEN** the allowed person signs in again with the same checked account and numeric user ID.
- **THEN** `DEOS` matches those IDs to the frozen run link and lets the review check go on.

#### Scenario: Pull request is not linked

- **WHEN** the pull request does not link to one run with an open gate.
- **THEN** the page stays open for reading, blocks the next step, and says that no task can move.

#### Scenario: Pull request head is old

- **WHEN** the sent head is not the live pull request head.
- **THEN** the page stops all host writes and asks the person to load the new head.

#### Scenario: One user ID does not match

- **WHEN** the signed-in account or host user ID does not match the frozen run link.
- **THEN** `DEOS` stops the review and makes no host write.

#### Scenario: Page sends forged user data

- **WHEN** the page body names an account or user that differs from the trusted service proof.
- **THEN** `DEOS` ignores the page fields, rejects the review, and records the safe rule fault.

### Requirement: Save the host review before moving the task

`BettaView` SHALL send all notes, replies, and the review choice to `GitHub` as the signed-in user. It SHALL ask `DEOS` to move the task only after the host has saved each write.

A saved `COMMENT` or `REQUEST_CHANGES` review SHALL target `In Progress`. A saved `APPROVE` review SHALL target `Merging`, with or without notes. If a host write fails or its result is not known, `DEOS` MUST NOT move the task.

#### Scenario: Person posts comments

- **WHEN** the host saves all notes and a review with no approval.
- **THEN** the page asks `DEOS` to move the linked task to `In Progress`.

#### Scenario: Person asks for changes

- **WHEN** the host saves a `REQUEST_CHANGES` review.
- **THEN** the page asks `DEOS` to move the linked task to `In Progress`.

#### Scenario: Person approves with comments

- **WHEN** the host saves all notes and the `APPROVE` review.
- **THEN** the page asks `DEOS` to move the linked task to `Merging`.

#### Scenario: Person approves with no comments

- **WHEN** the host saves an `APPROVE` review with no notes.
- **THEN** the page asks `DEOS` to move the linked task to `Merging`.

#### Scenario: Host write fails

- **WHEN** a needed host write fails or has no clear result.
- **THEN** the page does not ask for a task change and the task stays in its old state.

### Requirement: Retry only work that is not done

`DEOS` SHALL save the review record and the result of each host step. Each review, note, and reply write SHALL carry its stable part ID in host data that can be read back. A saved result SHALL also keep the host record ID, head, user, review type, and target facts.

A retry with the same ID SHALL check past results. It SHALL do only work that is not yet done. It MUST NOT post a review, note, or reply twice. It MUST NOT choose the gate path twice.

If a `GitHub` result is not clear, `DEOS` SHALL list host records and look for the stable part ID. It SHALL also check the saved head, user, type, and target facts. One exact match SHALL count as the saved result. A retry MAY send the write only when read-back proves that no match exists. If the read cannot prove one match or no match, the flow MUST stop for a host check and MUST NOT repeat the write.

If the host work is done and the task result is not clear, `DEOS` SHALL read the task state before a retry. The same ID with a new pull request, head, gate, type, or person MUST fail as a clash.

#### Scenario: Review reply is lost

- **WHEN** a review, note, or reply may be saved but its host reply was lost.
- **THEN** `DEOS` reads host state and checks the stable part ID and all saved facts before it may retry.

#### Scenario: Host read finds one match

- **WHEN** host read-back finds one record with the same part ID, head, user, type, and target.
- **THEN** `DEOS` saves that host record ID and does not send the write again.

#### Scenario: Host result stays unclear

- **WHEN** host read-back cannot prove one match or prove that no match exists.
- **THEN** the flow stops for a host check and does not repeat the write or move the task.

#### Scenario: Task move fails after the review

- **WHEN** the host review is saved but the task move fails.
- **THEN** a safe retry keeps the host result and retries only the task move.

#### Scenario: Task move reply is not clear

- **WHEN** the task may have moved but the host reply was lost.
- **THEN** `DEOS` reads the task state and then marks it done or makes one needed move.

#### Scenario: Done record is sent again

- **WHEN** the same done review record is sent more than once.
- **THEN** `DEOS` sends back the saved results and does not write to a host or choose a path again.

#### Scenario: Record ID is used for new facts

- **WHEN** a review ID is used with a new bound fact.
- **THEN** `DEOS` reports an ID clash and does no new work.

### Requirement: Show both host results

`BettaView` SHALL show the review result and task result as two steps. It SHALL show the goal state and say if the flow went on. A failed step SHALL be clear. A done step SHALL stay clear. The page SHALL offer a safe retry when one can help.

`DEOS` SHALL save the first host error and key act facts in a safe store before clean-up. The page MAY show a safe error code. It MUST NOT show a secret or say both steps worked when one failed.

#### Scenario: Both steps work

- **WHEN** the host saves the review and the task reaches its goal state.
- **THEN** the page marks both steps done and says the linked flow went on.

#### Scenario: Review step fails

- **WHEN** the host rejects the review.
- **THEN** the page shows that the review failed, the task did not move, and the draft can be tried again.

#### Scenario: Task step fails

- **WHEN** the host saves the review but the task does not reach its goal state.
- **THEN** the page keeps the saved review clear and offers a retry for the task move.
