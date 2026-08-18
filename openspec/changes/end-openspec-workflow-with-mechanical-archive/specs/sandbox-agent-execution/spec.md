## ADDED Requirements

### Requirement: Materialize trusted native archive continuation inputs

The terminal archive attempt SHALL receive the exact `/opsx:archive` instruction and a trusted OpenSpec change identity derived from the Linear issue identifier. Before starting Codex, the trusted runner SHALL restore the latest completed cumulative repository patch only after verifying its recorded digest and SHALL provide the prior structured results and complete artifact-manifest references needed to continue the same run. Missing or integrity-invalid continuation material MUST prevent archive execution from being accepted as successful.

#### Scenario: Archive attempt receives trusted inputs

- **WHEN** the Workflow dispatches the terminal archive agent after final approval
- **THEN** the durable job specification contains the exact `/opsx:archive` instruction and trusted OpenSpec change identity
- **AND** the materialized context references prior results and manifests from the same run
- **AND** the newest completed cumulative patch is restored after its digest verifies

#### Scenario: Cumulative patch digest does not match

- **WHEN** the bytes read for the latest cumulative patch do not match its recorded digest
- **THEN** the trusted runner stops before invoking Codex
- **AND** the archive attempt cannot advance the run through its completed edge

#### Scenario: No prior cumulative patch is available

- **WHEN** final approval routes a run to archive without a completed cumulative patch from an earlier attempt
- **THEN** the archive attempt fails closed before native OpenSpec archive is invoked
- **AND** the run does not reach terminal `succeeded`

### Requirement: Preserve native archive results after cleanup

The archive agent SHALL run native OpenSpec sync/archive for the trusted change and SHALL produce a cumulative patch containing the archived change plus every applicable main-spec synchronization. The trusted runner SHALL preserve the transcript, structured result, cumulative patch, validation output, provider references, and complete manifest with verified integrity before destroying the Sandbox. Confirmed cleanup SHALL remain mandatory for a completed archive outcome.

#### Scenario: Native archive completes successfully

- **WHEN** `/opsx:archive` completes for the trusted canary change
- **THEN** the cumulative patch contains the change under `openspec/changes/archive/`
- **AND** contains every applicable synchronized main-spec update
- **AND** strict validation appropriate to the archived capability passes without modifying unrelated active changes

#### Scenario: Archive artifacts survive Sandbox destruction

- **WHEN** the archive Sandbox is destroyed after successful collection
- **THEN** the complete manifest and each required artifact remain retrievable from durable storage
- **AND** every retrieved artifact matches its recorded digest

#### Scenario: Archive Sandbox cleanup fails

- **WHEN** the archive Sandbox cannot be confirmed destroyed
- **THEN** the attempt records cleanup failure and is not reported as fully successful
- **AND** the Workflow does not transition the run to `done`
