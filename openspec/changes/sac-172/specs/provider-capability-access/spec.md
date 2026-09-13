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

Each provider act SHALL have one logical result. The pull request identity SHALL stay fixed for the run. A retry MUST NOT create a second pull request update or a second question for the same goal.

A fresh attempt SHALL use fresh browser and test tools. It MUST NOT reuse an old attempt tool. Runs MUST NOT share provider effects. An unclear retry MUST NOT leave two browser or test resources for one attempt.

#### Scenario: Pull request response is lost

- **WHEN** the host may have saved a pull request update but its reply is lost.
- **THEN** a retry keeps the same pull request and does not add a second update for the same work.

#### Scenario: Clarification question is retried

- **WHEN** posting the open question has an unclear result.
- **THEN** DEOS keeps one open question for that run and block.

#### Scenario: Old browser session remains

- **WHEN** a fresh try starts while an old browser or test tool is still live.
- **THEN** DEOS bars reuse of the old tool and gives the fresh try new browser and test tools.

#### Scenario: Browser create call is retried

- **WHEN** one try gets no clear reply to its browser create call.
- **THEN** DEOS resolves the unclear result without leaving a second browser for that try.
