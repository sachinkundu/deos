## ADDED Requirements

### Requirement: Ship discovered runtime practices to future agents

Implementation Sandboxes SHALL include the maintained runtime skill and readable guide, referenced by the implementation prompt and tool help. Hooks and checked commands SHALL supply the provider CA without disabling TLS verification. The guide SHALL cover scratch-file placement, documentation access, local checks, browser scenario resets, preview publishing and recovery from saved work.

#### Scenario: A new implementation starts

- **WHEN** its sandbox is materialized.
- **THEN** the agent receives the working runtime instructions without needing a supervisor to rediscover them.

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

### Requirement: Collect browser demos as isolated scenarios

The author SHALL save an ordered list of actions and screenshot checkpoints
before collecting review images. One demo request SHALL hold the browser tool
queue for that whole list. Each scenario SHALL start in a fresh browser context
at its chosen preview URL. Cookies, local storage, session storage, page state,
focus and held keys MUST NOT carry over. The target and viewport SHALL stay fixed
within a scenario. The author SHALL prepare any needed server data separately
in the safe test scope and await collection before editing the app or harness.

Each action SHALL finish before the next starts. An action failure SHALL stop
the collection and retain the original error, scenario, step and partial
captures in diagnostics. A new collection SHALL replace the selected browser
gallery; only its completed screenshot list SHALL be published. Exploratory and
partial captures SHALL remain available as diagnostics. This is collection
behavior, not a workflow quality gate: no image judgment or extra review is added.

#### Scenario: Two browser scripts would otherwise overlap

- **WHEN** a demo list is running and another browser request arrives.
- **THEN** the second request waits until the complete list finishes or stops.

#### Scenario: A previous scenario changed browser state

- **WHEN** the next scenario starts.
- **THEN** it gets a fresh context in the same assigned browser and runs from its stated initial page.

#### Scenario: A click fails before its planned screenshot

- **WHEN** the browser cannot perform that click.
- **THEN** collection stops with the original error, takes no later screenshots, and does not publish the partial gallery. The author may fix the cause and rerun the list from zero.

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

### Requirement: Recover transport resources without repeating implementation

A healthy local preview SHALL remain alive when public relay readiness fails.
An identical request SHALL reuse it and reconcile the existing relay. Failed
local startup SHALL still clean up. The service MUST NOT silently change preview
settings or erase test data during recovery.

On a browser connection failure, DEOS SHALL retain the original error, provider
inventory and any available close reason. An explicit scenario reset MAY replace
a confirmed-ended browser once within the same active attempt. It SHALL preserve
the old resource receipt and fixed origins. A live or ambiguous session MUST NOT
be replaced. A lost creation response SHALL retain quarantine and the replacement
limit. Another session loss SHALL request help with saved work.

A lost tool response MUST NOT replay a click or submission. The author SHALL
restart the saved scenario list with the required fixture resets. This recovery
MUST NOT repeat prior workflow stages or add a review of agent judgment.

#### Scenario: Public relay is late

- **WHEN** local startup succeeded but the relay readiness request fails.
- **THEN** the app remains available locally and a retry reconciles the same relay.

#### Scenario: Assigned browser has ended

- **WHEN** an active author restarts a scenario and provider inventory confirms its first assigned session is absent.
- **THEN** the reset allocates one replacement with the same origins and retained history, without restarting implementation.

#### Scenario: Replacement also fails

- **WHEN** the replacement session ends or creation is ambiguous.
- **THEN** DEOS retains the failure and saved work without allocating browsers indefinitely.
