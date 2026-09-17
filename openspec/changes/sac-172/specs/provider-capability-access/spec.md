## ADDED Requirements

### Requirement: Publish run-owned static review previews

The trusted service SHALL offer an explicit static preview capability to enabled implementation runs. It SHALL accept a bounded build directory read as the unprivileged author, choose the run's account/project/preview branch itself, and keep credentials outside the agent. Worker code, bindings and production deployment SHALL remain outside this capability.

The service SHALL save build bytes and publication state before the provider effect, reconcile ambiguous responses, and retain provider and asset read-back. It SHALL expose a stable run-owned browser origin and an immutable human review URL that survives sandbox cleanup. Preview revision SHALL remain context, not a completion quality gate.

#### Scenario: Static app needs a durable review link

- **WHEN** the author publishes its saved static build with the enabled capability.
- **THEN** the service deploys it to that run's preview project and supplies the immutable review URL without exposing credentials.

#### Scenario: Deployment succeeds but its response is lost

- **WHEN** the same publish request is retried.
- **THEN** the service locates the prior deployment by its saved operation identity instead of blindly creating another deployment.

### Requirement: Check maintainer previews before browser access

When an approved design needs a hosted static preview, a trusted maintainer MAY
deploy it outside the agent and register it for a stopped implementation. The
registration SHALL bind the saved candidate, approved input, base, code tree,
build log digest, exact Pages account, project, deployment and preview branch.
The service SHALL read the successful nonproduction deployment from Pages and
hash its served assets. It SHALL reject aliases, redirects, changed assets,
wrong identities, stale work and a run that starts while checks are in flight.
It SHALL retain an immutable receipt without provider keys or raw environment
variables. Registration MUST NOT move the workflow or count as demo proof.

A fresh attempt MAY browse that run's checked static deployment using its one
service browser. The browser SHALL retain fixed local and hosted origins for
the whole attempt. The saved receipt SHALL expose the deployment revision as review context.
Switching targets SHALL require navigation and a fresh HTTP result. Each image
receipt SHALL retain its actual origin, even when local and hosted images have
identical bytes. The agent MUST NOT rewrite that provenance. This access adds
no provider write, deploy, approval, merge or release capability.

#### Scenario: A maintainer supplies the missing hosted preview

- **WHEN** a stopped run has a saved build and the maintainer registers a matching successful preview.
- **THEN** DEOS checks the provider and assets, saves the receipt, and supplies it to the next author and demo reviewers without marking a demo passed.

#### Scenario: The author edits after the preview was deployed

- **WHEN** the author's current code tree differs from the registered build.
- **THEN** the agent may continue using that preview and explains the revision difference for Claude and human review.

#### Scenario: Local and hosted screens look the same

- **WHEN** both targets return identical screenshot bytes.
- **THEN** each capture retains a distinct receipt with its checked origin and the demo reviewer sees the service's saved provenance.

### Requirement: Give implementation work narrow service access

DEOS SHALL use service-owned access for the build browser and safe test tools. It SHALL also use this access for trusted pull request acts. Access SHALL fit the run, repo, act, and try. Keys MUST stay out of prompts, commands, logs, patches, and proof.

The service user MUST NOT count as the allowed human account. It MUST NOT approve work or choose to merge it. After DEOS proves an exact human merge choice, the trusted service MAY carry out that one merge. This act MUST NOT make the service user an approver. The service user MUST NOT use a Google user session, change live state, or start a live release.

#### Scenario: Browser session is created

- **WHEN** a build job needs to check a web app.
- **THEN** a trusted tool makes one browser session for the run and keeps its key from the agent.

#### Scenario: Agent publishes implementation work

- **WHEN** the implementation and review messages complete their handoff.
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
