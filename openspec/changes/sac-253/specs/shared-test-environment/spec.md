## Purpose

Give one agent run a safe copy of the real app for full demos with real provider links, while live and staging work stay safe.

## ADDED Requirements

### Requirement: Give the shared site to one run

The system SHALL grant one active lease for the shared test site. The lease
SHALL name one workflow run, one agent attempt, and one test task. The site and
its data MUST NOT be shared by two runs at the same time. A second run MUST stay
in a wait state and MUST NOT change the site or its data.

A lease SHALL stay held while the owner uses the site or while cleanup is in
progress. A lost heartbeat or failed run MUST NOT let a new run take the site.
The system SHALL first stop old writes and prove that cleanup is done.

#### Scenario: Site is free

- **WHEN** an allowed run asks for the site and no lease or cleanup is active.
- **THEN** the system grants one lease and binds it to that run, attempt, and test task.

#### Scenario: Site is in use

- **WHEN** another run asks for the site while a lease is active.
- **THEN** the new run waits and makes no change to the site or its data.

#### Scenario: Owner stops sending heartbeats

- **WHEN** the lease owner fails or stops sending heartbeats.
- **THEN** the system blocks new owners, stops old writes, and cleans the site before it grants a new lease.

### Requirement: Pin the base from live staging

At lease grant, the system SHALL read the version that is live on staging. It
SHALL save a base record for each app service used by the test. The record SHALL
include the source commit and deployed version. The system SHALL start the test
site from that exact base and read the running versions back before agent work
can start.

The base MUST stay fixed for the full lease. A later staging deploy MUST NOT
change the active test site. The test site MUST NOT deploy to staging or live,
and it MUST NOT act as a staging or live release path. After cleanup, the next
lease SHALL read staging again and use the version that is live at that time.

#### Scenario: Lease starts from staging

- **WHEN** a run gets a lease while a set version is live on staging.
- **THEN** the test site starts from that version and saves matching source and deploy facts.

#### Scenario: Staging changes during a lease

- **WHEN** staging gets a new version while a test lease is active.
- **THEN** the active site keeps its saved base and does not take the new version.

#### Scenario: Next lease starts

- **WHEN** cleanup ends and a later run gets the next lease.
- **THEN** the system reads staging again and uses its current live version as the new base.

#### Scenario: Running version does not match

- **WHEN** the site cannot prove that each running service matches the saved base.
- **THEN** agent work stays blocked and no test provider write is allowed.

#### Scenario: Test work asks for release

- **WHEN** test work asks to deploy to staging or live.
- **THEN** the system rejects the request and keeps both release paths unchanged.

### Requirement: Keep app and provider data safe

The test site SHALL use test stores and test service state that are apart from
staging and live. It MUST NOT receive a staging or live data binding. Test writes
MUST NOT change a staging or live release. Provider keys MUST stay in trusted
services and MUST NOT be given to the agent or page.

Each app task SHALL use this test site before any later staging or live release
step. The task SHALL be in the current DEOS team, but it SHALL NOT need a special
test label. Before the first provider write, a trusted read SHALL save the task
ID, team, run, and lease. New Linear writes MUST stop if the task leaves that
team. A provider event MAY enter the test flow only when its signed event-time
facts match the saved task, run, and active lease.

GitHub writes SHALL be limited to the saved repository, branch, and pull request
owned by the leased run. All test records SHALL carry the run and lease IDs.
The system MUST reject a write to any other task, branch, pull request, app
store, or run.

#### Scenario: Current team task is admitted

- **WHEN** a trusted Linear read finds the run task in the current DEOS team.
- **THEN** the system binds that task to the lease and allows only the scoped test flow.

#### Scenario: Task has no test label

- **WHEN** an app task in the current DEOS team has no special test label.
- **THEN** the task may use the test site under the same lease and scope rules.

#### Scenario: Task leaves the current team

- **WHEN** the task leaves the current DEOS team before a later Linear write.
- **THEN** the system stops that write, keeps the fault, and starts no live flow.

#### Scenario: Provider event has the wrong scope

- **WHEN** a signed event names another task, run, or lease, or lacks saved event-time team proof.
- **THEN** the test flow records it as ignored and does not change the leased run.

#### Scenario: App asks for live data

- **WHEN** test code asks for a staging or live store or for a provider key.
- **THEN** the system denies the request and leaves staging and live data unchanged.

#### Scenario: GitHub target is not owned by the run

- **WHEN** the agent asks to write to a branch or pull request outside the saved lease scope.
- **THEN** the trusted service rejects the write and records the safe cause.

### Requirement: Show who holds the site

The frontend for the shared test environment SHALL be
`test-deos.voxdez.com`. It SHALL show a clear test name and the current lease
state. The issue being worked SHALL be the human-readable identity of the agent
that owns the site. While the lease is held, the page SHALL lead with the issue
name and key. It SHALL also show the workflow stage, saved staging base, and
lease start time in plain words. The agent role and opaque IDs MAY appear as
extra facts, but they MUST NOT replace the issue as the owner name.

The page SHALL also show when the site is free, being prepared, or being
cleaned. It MUST NOT show provider keys, raw errors, or private app data.

#### Scenario: Agent holds the lease

- **WHEN** a person opens the test portal during active agent work.
- **THEN** the page names the issue as the current agent work and shows its active stage, base, and lease time.

#### Scenario: Cleanup is active

- **WHEN** the old run has ended but cleanup is not yet proved.
- **THEN** the page says that cleanup is in progress and does not call the site free.

#### Scenario: Site is free

- **WHEN** no lease, setup, or cleanup is active.
- **THEN** the page says that the shared test environment is free.

### Requirement: Clean the site before reuse

Before a lease ends, the system SHALL stop new app and provider writes. It SHALL
attach the run's safe proof to the pull request body. The body SHALL include or
embed the safe images, command proof, data read-back, and provider receipts. The
system SHALL read the body and each attached item back. A link to a local or
repository file by itself SHALL NOT count as attached proof. The system SHALL
then remove the lease's app data, provider test fixtures, deploy state, and
secrets. It SHALL read back that the test data and run access are absent before
it marks the site free.

Proof attached for review SHALL stay available in the pull request body after
cleanup. Its attached items MUST NOT depend on the test site. Cleanup MUST NOT
remove that proof. It MUST NOT remove data owned by another run or any staging
or live data.

If proof save, data removal, or read-back fails, the system SHALL keep the
original error and lease facts. It SHALL show cleanup as blocked and MUST NOT
grant the site to a new run. No waiting run SHALL get a lease until the proof,
removal, and absence checks all pass.

#### Scenario: Run ends cleanly

- **WHEN** the owner ends its test and the pull request body and attached proof can be read.
- **THEN** the system removes the run's test data and access, proves absence, and then frees the site.

#### Scenario: Proof is viewed after cleanup

- **WHEN** a reviewer opens the linked pull request after the test site is free.
- **THEN** its body still shows the attached images, command proof, data read-back, and safe provider receipts.

#### Scenario: Cleanup result is unclear

- **WHEN** removal fails or read-back cannot prove that run data is absent.
- **THEN** the lease stays blocked, the first error and its cause stay saved, and no waiting run gets the site.

#### Scenario: Cleanup sees unrelated data

- **WHEN** cleanup finds data that is not bound to the ending run and lease.
- **THEN** it leaves that data unchanged and raises a scoped cleanup fault.

### Requirement: Prove the real flow with stalled SAC-182 work

The first full proof SHALL continue the stalled SAC-182 work in this shared
environment. Its task SHALL meet the team and lease rules. The proof SHALL show
lease grant, the pinned staging base, the issue identity on the portal, real app
use, a real GitHub result, a provider-made Linear event received by the test
Worker, the saved result, cleanup, and the next free state.

A signed request made by a local tool straight to the Worker MAY be kept as
synthetic ingress proof. It MUST NOT count as the provider-made Linear proof.
The pull request body SHALL keep attached safe screen images of the provider
setup and the triggering task state, plus command and data read-back proof.

#### Scenario: SAC-182 runs through the shared site

- **WHEN** the stalled SAC-182 work resumes in the current team and gets the lease.
- **THEN** it uses the pinned real app and scoped provider links, and its pull request keeps the full proof after cleanup.

#### Scenario: Only synthetic ingress is shown

- **WHEN** a test sends a correct signed request straight to the Worker but no real Linear event reaches it.
- **THEN** the result is marked as synthetic proof and the full provider test stays incomplete.

#### Scenario: Real Linear event is received

- **WHEN** Linear emits the task event and the test Worker accepts it.
- **THEN** durable records link the provider delivery, lease, run, task, app result, and later cleanup proof.
