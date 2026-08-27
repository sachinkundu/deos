## Purpose

Keep safe proof of what each review checked, found, and fixed. Keep this proof out of standard OpenSpec files.

## ADDED Requirements

### Requirement: Preserve immutable evidence for every review attempt

DEOS SHALL save a fixed proof set for each review job. This rule SHALL apply if the job passed, was blocked, failed, or was stopped. The set SHALL name the run, job, stage, mode, and round. It SHALL name the plan hash and reviewed head, if one exists. It SHALL include the saved model provider, model, and thought level or provider equivalent. It SHALL list each source and hash. It SHALL also keep the raw result, clean result, sidecar, test result, findings, fixes, chat log, and safe job result. It SHALL keep safe provider receipts when they exist. If an output is missing or unsafe, the set SHALL say so. It MUST NOT make up its content.

#### Scenario: Review attempt completes

- **WHEN** a review job ends
- **THEN** its file list names each safe output and its ID and hash

#### Scenario: Expected output is absent

- **WHEN** an ended job has no expected output
- **THEN** the proof marks it absent and saves all other safe outputs

#### Scenario: Evidence cannot be verified

- **WHEN** a needed file or file list cannot be saved and read back with its hash
- **THEN** DEOS does not accept a pass and keeps the proof for a retry

### Requirement: Index review proof for direct lookup

DEOS SHALL keep one saved row for each review. The row SHALL point to the exact proof set. A lookup MUST NOT need a scan of file storage. The row SHALL name the review input ID, review, run, job, stage, mode, and round. It SHALL name the author model, review provider, and review model. It SHALL name the thought setting, prompt version, tool version, plan hash, reviewed head, and base finding set. It SHALL also name the file links, result, and times. A reused result, new head binding, inconsistent result, or human-escalation decision SHALL point to the original proof and its later decision without copying the semantic result.

#### Scenario: Operator opens a known review

- **WHEN** an allowed user asks for a review by its saved ID
- **THEN** DEOS finds its row and accepted proof set at once

#### Scenario: Sandbox has been removed

- **WHEN** the short-lived review space is gone
- **THEN** the saved proof can still be read and checked by its hashes

#### Scenario: Accepted result is reused

- **WHEN** a later dispatch has the same review input ID
- **THEN** its saved reuse record points to the accepted proof and states that no new model job ran

#### Scenario: Same-stage review results conflict

- **WHEN** one review stage contradicts its own saved rating without a matching source change
- **THEN** the evidence links both results and the human-escalation decision and does not invent another semantic result

### Requirement: Validate structure without overstating meaning

The proof check SHALL test the file list, paths, hashes, quotes, and line ranges. It SHALL test the plan map and each spec map. It SHALL test both link ways, the plan ID, and the closed finding list. These checks prove form and freshness. The models attempt semantic checks, but their results are not absolute because model output is probabilistic. Each semantic view SHALL stay tied to its named provider and model.

#### Scenario: Sidecar is structurally valid

- **WHEN** each needed row and quote matches the exact reviewed files
- **THEN** the proof check may accept the sidecar as current form proof

#### Scenario: Semantic judgment is displayed

- **WHEN** a user reads a map or finding result
- **THEN** DEOS calls it a model view and not a hard fact

### Requirement: Bind evidence to one exact candidate

The first check SHALL bind to one private plan hash. The outside check SHALL also bind to one pull request head. DEOS MUST mark proof stale if the chosen draft, plan hash, or head does not match the saved ID. A trusted head rebind MAY keep the semantic result current only after it proves that the complete reviewed file list and hashes are unchanged.

#### Scenario: Evidence matches the selected version

- **WHEN** the chosen plan and head match the review row and all file hashes
- **THEN** DEOS marks the proof current for that exact version

#### Scenario: Evidence is shown against newer work

- **WHEN** a chosen file or pull request head is not the reviewed version
- **THEN** DEOS labels the proof stale and does not use it as gate evidence

#### Scenario: New head has identical reviewed files

- **WHEN** a trusted comparison proves that every reviewed file path and hash matches an accepted result
- **THEN** DEOS may bind that semantic result to the new head and keeps both the original proof and rebind record

### Requirement: Keep OpenSpec artifacts standard

Review IDs, links, hashes, quotes, and marks SHALL stay in sidecars, file lists, and review rows. DEOS MUST NOT put them in an OpenSpec proposal, delta spec, design, or task file.

#### Scenario: Planning artifacts are published

- **WHEN** DEOS posts reviewed OpenSpec plan work
- **THEN** its standard files have only normal OpenSpec text and the proof stays outside them
