## Purpose

Let an allowed reader review one GitHub planning pull request, its exact DEOS trace, and the retained author-review process in one protected portal.

## ADDED Requirements

### Requirement: Open one governed pull request in three connected views

BettaView SHALL accept a canonical GitHub pull-request URL and show **PR**, **Trace**, and **Process** views for the same pull request. It SHALL load the live pull-request head from GitHub and resolve the related DEOS run by repository and pull-request number. It MUST NOT require a run identifier in the entry URL.

#### Scenario: Reader opens a governed planning pull request

- **WHEN** an allowed reader opens BettaView with a governed planning pull-request URL
- **THEN** the portal loads the rendered pull request and connects its trace and process views to the DEOS run for that repository and pull-request number

#### Scenario: Pull request has no DEOS run

- **WHEN** a reader opens a valid pull request that DEOS does not govern
- **THEN** BettaView keeps the pull-request reader available and states that no DEOS trace or process story was found

### Requirement: Preserve exact-head trace meaning

BettaView SHALL render only hash-verified trace data selected by DEOS. It SHALL compare the reviewed head with the live GitHub head and MUST NOT present evidence from an older head as current.

#### Scenario: Reviewed and live heads match

- **WHEN** the accepted trace names the live pull-request head
- **THEN** BettaView labels the trace current and renders its directional links and citations

#### Scenario: Pull request moved after review

- **WHEN** the live pull-request head differs from the reviewed head
- **THEN** BettaView keeps the evidence readable, labels it stale, and shows both head identities

### Requirement: Show the retained review process

The **Process** view SHALL show every safe retained review attempt in chronological order. It SHALL include actual available reviewer output, author dispositions and reasons, candidate identities, later checks, failures, retries, reuse, head bindings, and provider or workflow outcomes. It MUST label missing or redacted records and MUST NOT reconstruct them from a summary.

#### Scenario: Reader inspects SAC-139

- **WHEN** the reader opens the planning pull request for the completed SAC-139 run
- **THEN** the process view shows its retained internal and external review work, author response records, failed attempts, and final human-review state without starting another workflow

#### Scenario: An older attempt lacks a safe artifact

- **WHEN** a process event refers to content that was not retained or cannot pass its manifest and hash checks
- **THEN** BettaView labels the content unavailable and does not invent or expose it

### Requirement: Keep review actions under the human GitHub identity

BettaView SHALL use a GitHub user authorization for pull-request reads and writes. Comments, replies, approvals, change requests, and annotation uploads SHALL use that user's token. BettaView MUST NOT use a shared installation identity for a human review action.

#### Scenario: Authorized reader publishes a review

- **WHEN** a signed-in reader publishes supported comments or a review decision
- **THEN** GitHub records the action under that reader's identity and BettaView reports the provider result

#### Scenario: Reader lacks one write permission

- **WHEN** the reader can open the pull request but lacks permission for a requested write
- **THEN** BettaView keeps reading available and explains which action is unavailable

### Requirement: Keep model execution out of the cloud reader

The cloud BettaView Worker MUST NOT expose a route that starts Codex, another model, or a local trace generator. It SHALL consume only trace and process data already selected by DEOS.

#### Scenario: Client requests trace generation

- **WHEN** a client calls the former trace-generation route on the cloud deployment
- **THEN** BettaView returns a not-found or method-not-allowed response and starts no model work

### Requirement: Offer GitHub and BettaView from DEOS

When a workflow node or visit has a planning pull-request URL, the DEOS node detail SHALL show **Open on GitHub** and **Open in BettaView** actions for that same canonical pull request.

#### Scenario: Reader opens the SAC-139 planning node

- **WHEN** the reader selects the SAC-139 planning node or visit
- **THEN** both actions target its existing planning pull request and the BettaView action carries only the encoded canonical pull-request URL
