## ADDED Requirements

### Requirement: Give implementation work narrow service access

DEOS SHALL use service-owned access for the build browser and safe test tools. It SHALL also use this access for trusted pull request acts. Access SHALL fit the run, repo, act, and try. Keys MUST stay out of prompts, commands, logs, patches, and proof.

The service user MUST NOT count as the allowed human account. It MUST NOT approve work or choose to merge it. After DEOS proves an exact human merge choice, the trusted service MAY carry out that one merge. This act MUST NOT make the service user an approver. The service user MUST NOT use a Google user session, change live state, or start a live release.

#### Scenario: Browser session is created

- **WHEN** a build job needs to check a web app.
- **THEN** a trusted tool makes one browser session for the run and keeps its key from the agent.

#### Scenario: Agent publishes implementation work

- **WHEN** the build patch and proof pass trusted checks.
- **THEN** the trusted GitHub tool makes or updates the one pull request for the run and saves its receipt.

#### Scenario: Service identity attempts approval

- **WHEN** a service key or agent asks to approve, choose a merge, or release the work on its own.
- **THEN** DEOS denies the action and waits for the allowed human choice.

#### Scenario: Human merge choice is proven

- **WHEN** DEOS proves the exact merge choice from the allowed human account.
- **THEN** the trusted service may carry out that merge and saves both the human choice and merge receipt.

#### Scenario: Agent tries to read a credential

- **WHEN** repo code or an agent command asks for a browser, host, or test key.
- **THEN** the trusted tool denies access and saves the safe rule result.

### Requirement: Reconcile implementation provider effects

Each host act SHALL use a stable key for its own goal. The pull request identity SHALL stay fixed for the run. Each pull request update SHALL use the run, patch digest, and update kind. A question key SHALL use the run and block. A review reply key SHALL use the run, root note, and reply goal.

A browser or test tool key SHALL also use the attempt and tool kind. A retry of the same act SHALL reuse its key and read the host first. A fresh attempt SHALL use a new key and fresh browser and test tools. DEOS MUST NOT make two effects for one key or reuse an old attempt tool.

#### Scenario: Pull request response is lost

- **WHEN** the host may have saved a pull request update but its reply is lost.
- **THEN** the trusted tool reads the run branch and pull request before a retry.

#### Scenario: Clarification question is retried

- **WHEN** posting the open question has an unclear result.
- **THEN** DEOS reads the Linear issue and keeps one question for that run and block.

#### Scenario: Old browser session remains

- **WHEN** a fresh try starts while an old browser or test tool is still live.
- **THEN** DEOS uses a new attempt key, bars reuse of the old tool, and saves clean-up work.

#### Scenario: Browser create call is retried

- **WHEN** one try gets no clear reply to its browser create call.
- **THEN** DEOS reads the host with the same action key and does not make a second browser for that try.
