## ADDED Requirements

### Requirement: Isolate each implementation run and its tests

The trusted runner SHALL give each build run its own branch and test name space. Each build try SHALL get a fresh sandbox, worktree, browser, and test scope. A run MUST NOT read or write the work, files, test data, session, or branch of another run. A retry or edit SHALL use a fresh try. It SHALL rebuild state from saved run facts and MUST NOT reuse the old try's tools.

Tests SHALL use local or safe non-live tools. The build job MUST NOT deploy, change live data, or change a live site. Clean-up SHALL use the old proof rules.

Cloudflare says each sandbox has its own files, tasks, and network: https://developers.cloudflare.com/sandbox/concepts/security/.

#### Scenario: Two runs build at once

- **WHEN** two build runs work at the same time.
- **THEN** each run uses its own worktree, sandbox, browser, test data, and branch.

#### Scenario: Run checks a web app

- **WHEN** a build run starts the changed app for web checks.
- **THEN** it shows only that run's safe test site to its set browser.

#### Scenario: Attempt resumes after cleanup

- **WHEN** a fresh try starts after an old sandbox was removed.
- **THEN** it restores the exact run branch and saved facts in a new worktree, sandbox, browser, and test scope.

#### Scenario: Check tries to reach a live target

- **WHEN** a command or browser action would change live service state or live data.
- **THEN** the runner denies the act and keeps the build run out of the pass path.

### Requirement: Give implementation agents safe browser and web access

The trusted runner SHALL give build agents browser control. It SHALL use a DEOS service user, not a person's Google session. Each browser SHALL serve one run and the sites needed for its checks. The agent SHALL be able to view pages, take proof shots, and fix what it sees.

The agent SHALL also have read-only web search for current first-party docs. Browser and search use MUST NOT add host write, secret, approval, merge, or release rights.

#### Scenario: Agent checks a page

- **WHEN** a web app change is ready for behavior checks.
- **THEN** the agent opens the run's test instance with its service-owned browser and can save a sanitized proof image.

#### Scenario: Agent needs current docs

- **WHEN** the build needs a service fact that may have changed.
- **THEN** the agent may search current first-party docs and cites each source it uses.

#### Scenario: Browser asks for a personal session

- **WHEN** a check would need the allowed person's Google cookies or personal login.
- **THEN** the runner keeps that session out and the agent uses a safe test path or reports a block.

### Requirement: Preserve implementation failures and resumable work

The trusted runner SHALL keep the first error, stack, cause chain, failed act, patch, checks, proof, and task state. It SHALL do so before clean-up when each item exists. It SHALL hide keys but keep useful facts. A clean-up or proof-write fault MUST NOT replace the first error. Saved work SHALL name the old attempt but MUST NOT grant reuse of its browser or test tools.

#### Scenario: A build command fails

- **WHEN** a build command ends with an error.
- **THEN** the saved try proof keeps the first command facts, error, stack, cause, and patch.

#### Scenario: Proof storage also fails

- **WHEN** proof storage fails after a build error.
- **THEN** DEOS keeps both errors and treats the build error as the first cause.

#### Scenario: Fresh attempt follows a human reply

- **WHEN** the build starts again after a reply.
- **THEN** the new attempt gets the saved work and reply, but it gets fresh browser and test tools.
