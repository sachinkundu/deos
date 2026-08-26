## MODIFIED Requirements

### Requirement: Produce one proposal-and-specification pull request

The simple flow SHALL send one plan job to create or change the issue-named OpenSpec change. The job SHALL write the proposal first. It SHALL then write each needed delta spec in order. DEOS SHALL test the full plan set and keep it private until the first check passes. A trusted step SHALL then post that exact plan to one GitHub pull request. It SHALL also post the needed OpenSpec change data. Each file request SHALL use its full repo path under `openspec/changes/<change>/`. The human review list SHALL use paths from the change folder. The plan job MUST NOT write a design or task list. It MUST NOT change app code or Linear state. It also MUST NOT approve, post, or merge its own work.

#### Scenario: First planning attempt completes

- **WHEN** the plan job makes a valid proposal and all needed delta specs
- **THEN** DEOS saves the exact private plan and starts its first check with no pull request

#### Scenario: Internal check passes

- **WHEN** the first check passes for the exact private plan
- **THEN** the trusted post step sends only those plan files and needed change data to one run branch and pull request and saves the provider receipt

#### Scenario: Planning artifacts are incomplete or invalid

- **WHEN** a proposal, needed delta spec, test result, review proof, or post receipt is missing or bad
- **THEN** the flow does not enter `Human Review` or report plan success

#### Scenario: Publication uses a short file path

- **WHEN** a plan post file lacks the `openspec/changes/<change>/` prefix
- **THEN** the trusted step rejects it and the flow does not count the plan job as done

#### Scenario: Planning agent attempts a deferred action

- **WHEN** the plan job asks for a design, task list, app change, Linear move, pull request post or merge, or an out-of-scope provider task
- **THEN** DEOS rejects the ask and does not count the plan job as done

#### Scenario: Published head has not passed independent review

- **WHEN** the planning pull request head lacks a passing outside check
- **THEN** the flow keeps the issue out of `Human Review`

### Requirement: Reuse the planning pull request for revisions

Each allowed change SHALL use a fresh agent job. It SHALL keep the run branch and pull request ID. The new job SHALL get the saved plan patch and past result. It SHALL also get the pull request link and the set human or review notes. A review fix SHALL pass its closed-set recheck before the flow moves on. A human change SHALL start a new review round. Both checks SHALL pass for the new exact work before the issue returns to `Human Review`.

The change SHALL reply once on each human GitHub thread that it affects. A trusted post step SHALL send each short reply. It SHALL say what changed or why no change was made. It MUST NOT close the thread.

#### Scenario: Human requests planning changes

- **WHEN** an allowed person moves the issue from `Human Review` to `In Progress`
- **THEN** the flow starts a new round, updates the same branch and pull request, and waits for both checks on the new head

#### Scenario: Traceability review requests a repair

- **WHEN** a full first or outside check finds an issue and a fix remains
- **THEN** a fresh plan job changes the same private plan or pull request and sends it to the right closed-set recheck

#### Scenario: Revision is retried

- **WHEN** one change post is retried after an unclear reply
- **THEN** the trusted GitHub step reads the run branch and pull request and does not make a copy

#### Scenario: Revision addresses review comments

- **WHEN** a change gets human notes on one or more GitHub threads
- **THEN** it replies once on each changed thread and leaves each thread open

#### Scenario: Earlier sandbox has been removed

- **WHEN** a change starts after the old plan space is gone
- **THEN** the flow rebuilds the plan checkout from saved facts and does not need the old files or jobs

## ADDED Requirements

### Requirement: Keep the live planning flow unchanged during plan gates

Proposal, spec, and design gates SHALL change only OpenSpec plan files and their review notes. They MUST NOT turn on a selector, deploy code, change a live flow file, or alter a live prompt. Live changes SHALL wait for an approved design and the later work phase.

#### Scenario: A planning gate requests a live change

- **WHEN** work in a proposal, spec, or design gate asks to deploy or change the live planning path
- **THEN** DEOS rejects that work and keeps the live path as it was
