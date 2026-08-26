## ADDED Requirements

### Requirement: Correlate every trace review stage

Each trace event SHALL use the flow's shared link ID. It SHALL name the review input ID, review, run, job, try, phase, mode, and round. It SHALL also name a safe plan ID and the reviewed head, when one exists. It SHALL name the base finding set and each related finding ID. It SHALL name the model, thought level, tool version, result, file list, and provider task. It SHALL say whether the result was started, reused, made stale, rejected as inconsistent, or superseded. These fields SHALL link events to saved review records. They MUST NOT expose plan text.

#### Scenario: Review stage completes

- **WHEN** a check, fix, recheck, publish step, or provider report ends
- **THEN** its event gives the result, shared link data, and safe saved IDs

#### Scenario: Operator follows a finding round

- **WHEN** an operator looks up one review or base finding set
- **THEN** the checks, fixes, files, head changes, and provider reports can be read in order

#### Scenario: Review head becomes stale

- **WHEN** a planning pull request moves past its reviewed head
- **THEN** an event marks the proof stale, names both safe head IDs, and does not claim a pass

#### Scenario: Accepted semantic result is reused

- **WHEN** DEOS finds an accepted result for the same review input ID
- **THEN** an event names the reused review and records that no Sandbox, model job, or job try was used

#### Scenario: Later result conflicts with a fixed rating

- **WHEN** DEOS rejects or supersedes a contradictory rating
- **THEN** an event names both safe review IDs and the proof decision without exposing finding text

#### Scenario: Review emits planning content

- **WHEN** review output has plan text, findings, notes, quotes, prompts, or chat logs
- **THEN** events leave out that text and keep only safe IDs and guarded file links
