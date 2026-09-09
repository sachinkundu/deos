## MODIFIED Requirements

### Requirement: Execute each agent attempt in an isolated bounded environment

Each top-level agent attempt SHALL run in its own sealed Sandbox. It SHALL have a clear attempt ID, repo, revision, and run link. A retry or later top-level step MUST use a new attempt ID. It MUST NOT use files or tasks left by an old attempt.

An active OpenSpec author MAY host a set of review subagents. They MAY use the author's Sandbox. Each reviewer SHALL have its own subagent ID and fresh model session. It MUST NOT count as a new top-level attempt or Sandbox.

#### Scenario: Controlled repository is prepared

- **WHEN** a workflow starts a top-level agent attempt.
- **THEN** the Sandbox has the set repo at the saved revision and links the attempt to the run.

#### Scenario: Attempt is retried

- **WHEN** policy lets a failed or stopped top-level attempt run again.
- **THEN** the retry gets a new attempt ID and clean Sandbox linked to the same run.

#### Scenario: A fresh agent continues review work

- **WHEN** the Workflow starts a later top-level agent to act on past review notes.
- **THEN** the new attempt gets the saved repo, branch, revision, notes, results, and artifact refs without the old Sandbox.

#### Scenario: An author starts a self-check subagent

- **WHEN** an active OpenSpec author asks for its set self-check.
- **THEN** a fresh review subagent runs in the author's Sandbox with the same top-level attempt ID and its own subagent ID.
