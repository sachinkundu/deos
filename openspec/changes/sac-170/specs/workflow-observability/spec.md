## ADDED Requirements

### Requirement: Show self-review inside the author step

The portal SHALL show plan and design self-review as work within the first author step. It MUST NOT show self-review as a separate phase in the main flow. The author step SHALL show the first check, the one fix turn when used, the closed recheck, and any open issues.

Independent review SHALL remain a separate phase. The view SHALL show its reviewed head, result, sources, concerns, author responses, and later head. A later human edit SHALL show that no new semantic review was due. The view MUST NOT label agent review as human approval.

#### Scenario: First author step is open

- **WHEN** a person opens a plan or design author step that used self-review.
- **THEN** the step shows its check, fix, recheck, proof, and open issues in one place.

#### Scenario: Main flow is shown

- **WHEN** the portal draws a run on the new fixed graph.
- **THEN** self-review appears within the author step and independent review appears as its own phase.

#### Scenario: Human edit returns to review

- **WHEN** a later human edit reaches the human gate with no new semantic review.
- **THEN** the portal states that no new review was due and keeps old review proof as history.

### Requirement: Open useful review transcripts

For each saved author, self-review, and independent review job, **View transcript** SHALL open a useful log for the selected job.

If an old job has a valid log with no events, the portal SHALL show a clear empty state. It MUST NOT return an error page merely because the old log is empty.

#### Scenario: Review log has events

- **WHEN** a person selects **View transcript** for a review job with captured events.
- **THEN** the portal opens a useful log for that job.

#### Scenario: Old review log is empty

- **WHEN** a person opens a valid old log that has no captured events.
- **THEN** the portal says that no transcript content was captured and does not show an error.
