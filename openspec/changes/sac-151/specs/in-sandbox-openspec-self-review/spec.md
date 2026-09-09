## Purpose

Keep an OpenSpec author active while fresh, read-only subagents check plan and design drafts and return clear findings.

## ADDED Requirements

### Requirement: Run self-checks in the active author Sandbox

DEOS SHALL run each plan or design self-check as a review subagent. It SHALL run in the active author's Sandbox. The author session SHALL stay live for each check and fix. The review MUST NOT start a new Sandbox or top-level attempt.

#### Scenario: Planning draft is ready for its self-check

- **WHEN** the active plan author makes a valid private draft.
- **THEN** DEOS starts its review subagent in that author's Sandbox and keeps the author session live.

#### Scenario: Design draft is ready for its self-check

- **WHEN** the active design author makes a valid private draft.
- **THEN** DEOS starts its review subagent in that author's Sandbox and does not start a second Sandbox.

### Requirement: Start each reviewer with fresh review context

Each check and recheck SHALL start a fresh review session. The review SHALL get the same full change input and role. It SHALL get the same saved model settings, prompt, result rules, and tools. It MUST NOT get the author's chat, hidden state, or unsaved notes.

#### Scenario: First self-check starts

- **WHEN** DEOS starts a review subagent for a private draft.
- **THEN** the reviewer starts with fresh state and the full saved review input.

#### Scenario: Recheck starts after a fix

- **WHEN** the author asks for a recheck of a fixed draft.
- **THEN** DEOS starts a new review session with the set recheck input and no prior live review state.

#### Scenario: Fresh context cannot be proved

- **WHEN** a reviewer can read the author's chat, hidden state, or unsaved notes.
- **THEN** DEOS rejects that result and does not move the loop on.

### Requirement: Keep the author and reviewer in one bounded loop

The author SHALL get each valid check result in its live session. The author MAY fix the draft and ask for another check. The loop SHALL keep all current rules, limits, and stop results.

#### Scenario: Reviewer finds a concern

- **WHEN** a check returns a valid finding and a fix turn remains.
- **THEN** the live author gets the finding, may fix the draft, and asks for another check.

#### Scenario: Reviewer passes the draft

- **WHEN** the current check result meets the set pass rule.
- **THEN** DEOS ends the loop with the same pass result as the old flow.

#### Scenario: Fix limit is reached

- **WHEN** a finding stays open after the set fix limit is used.
- **THEN** DEOS stops the loop with the same finding and stop result as the old flow.

#### Scenario: Review needs human judgment

- **WHEN** the set review rules call for human judgment.
- **THEN** DEOS stops the fix loop and keeps the same result and proof.

### Requirement: Prove that reviewers do not change files

A review subagent SHALL have read-only repo tools and no provider write access. DEOS SHALL check all tracked review files before and after each run. Both checks MUST name the same file set and hashes. A result MUST NOT pass if a tracked file changed during the run.

#### Scenario: Reviewer reads the draft

- **WHEN** a reviewer uses its allowed tools to read the draft.
- **THEN** the before and after checks show the same tracked paths and hashes.

#### Scenario: Reviewer changes a tracked file

- **WHEN** a tracked file is not the same after the review.
- **THEN** DEOS rejects the result, saves a file check fault, and does not count that run as a review turn.

#### Scenario: Reviewer asks for provider access

- **WHEN** a self-check tries to write to GitHub, Linear, or another provider.
- **THEN** DEOS denies the request and does not accept the result.

### Requirement: Save review results before author cleanup

DEOS SHALL save the final accepted check result and all proof the current flow needs. The saved record SHALL link the input, review subagent, author attempt, findings, stop result, and file checks. The author Sandbox MUST stay until the result and proof are stored and checked.

#### Scenario: Self-check loop ends

- **WHEN** a plan or design check reaches a stop result.
- **THEN** DEOS stores that result and its required proof with the live author attempt.

#### Scenario: Review evidence is not durable

- **WHEN** the final result or required proof cannot be stored and checked.
- **THEN** DEOS does not accept the author attempt and keeps the Sandbox for proof repair.

### Requirement: Keep later review and approval separate

Independent review SHALL stay in its own fresh stage after the trusted post. It MUST NOT run as an author subagent. Human approval SHALL stay at a later human gate. No author or self-check result SHALL approve that gate.

#### Scenario: Self-check completes

- **WHEN** a private draft reaches its self-check stop result.
- **THEN** the flow runs the trusted post and outside review before a human gate can open.

#### Scenario: Independent review starts

- **WHEN** the trusted post makes the pull request head ready.
- **THEN** DEOS starts the outside reviewer in its own fresh stage.

#### Scenario: Self-check looks like approval

- **WHEN** an author or self-check result looks like an approval.
- **THEN** DEOS ignores it and waits for the needed human choice.
