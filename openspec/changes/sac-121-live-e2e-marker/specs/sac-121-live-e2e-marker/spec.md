## Purpose

Defines a deterministic repository marker used to audit the SAC-121 PR #46 live workflow lifecycle without deployment or release side effects.

## ADDED Requirements

### Requirement: Exact canary marker bytes
The repository SHALL contain `canary/sac-121-pr46-e2e.txt` with the exact bytes `sac-121-pr46-live-e2e\n`, where `\n` is one trailing line-feed byte and no other bytes are present.

#### Scenario: Marker content is inspected
- **WHEN** the marker file is read as raw bytes
- **THEN** its content equals `sac-121-pr46-live-e2e\n` exactly

### Requirement: Deterministic Node verification
The repository SHALL provide a deterministic Node test that reads the marker as raw bytes and verifies the exact byte sequence without network access, credentials, deployment, or release activity.

#### Scenario: Verification succeeds for the required marker
- **WHEN** the deterministic Node test runs against the required marker file
- **THEN** the test passes without external side effects

#### Scenario: Verification detects any byte difference
- **WHEN** the marker differs by content, encoding, trailing newline count, or any additional byte
- **THEN** the deterministic Node test fails

### Requirement: Terminal OpenSpec archival
At the terminal archive node, the workflow SHALL sync this delta specification into the main OpenSpec specifications and move the completed change into `openspec/changes/archive/`.

#### Scenario: Terminal archive completes
- **WHEN** all authorized workflow gates have completed and the terminal archive node runs
- **THEN** the main specifications include this capability and the change no longer remains in the active changes directory

### Requirement: No deployment or release
Implementing and verifying this canary SHALL NOT deploy or release any artifact.

#### Scenario: Canary implementation is completed
- **WHEN** the marker and its deterministic test are added and validated
- **THEN** no deployment or release operation has occurred
