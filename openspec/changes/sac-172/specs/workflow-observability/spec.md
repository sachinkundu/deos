## ADDED Requirements

### Requirement: Show implementation progress and proof

The portal SHALL show the checked design base, build tries, task state, branch, pull request, checks, and proof. It SHALL mark each proof item as an image, a Showboat log, a real host event, or a fake event. Unit tests MUST NOT be the sole proof of how the app acts.

The view SHALL show which patch digest and base digest each proof item covers. Old proof SHALL stay in the past. It MUST NOT look like proof for the new patch. The portal SHALL show the final gate as blocked while any needed proof is stale.

#### Scenario: Implementation is active

- **WHEN** a person opens a run while the build is in flight.
- **THEN** the portal shows the task state, try, branch, base, and last safe step.

#### Scenario: Pull request is ready

- **WHEN** the build enters its final human gate.
- **THEN** the portal links the exact pull request, check results, task list, and current behavior proof.

#### Scenario: Candidate changes after proof

- **WHEN** an edit changes the patch after proof was saved.
- **THEN** the portal marks the old proof as stale and shows the final gate as blocked until new proof covers the current patch and base.

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
