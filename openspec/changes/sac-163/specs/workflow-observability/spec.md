## ADDED Requirements

### Requirement: Show plan edits made during Design

The workflow view SHALL show when a design draft changes the approved plan. It SHALL show each changed path and the exact text edits. It SHALL link those edits to the design pull request. It SHALL also show the old plan and the current draft head.

If no plan file changed, the view SHALL say that the design uses the approved plan. Plan and design text MUST stay out of public logs. It SHALL appear only in an allowed review view or provider link.

#### Scenario: A design candidate changes the plan

- **WHEN** a person opens a design round whose candidate changes the approved plan.
- **THEN** the view shows each changed plan file and its text changes.
- **AND** it shows the prior plan and the current head.

#### Scenario: A design candidate keeps the plan

- **WHEN** a person opens a design round with no proposal or delta spec edit.
- **THEN** the view says that the design still uses the approved plan.

#### Scenario: An operator reads public telemetry

- **WHEN** an operator traces a design round through public logs.
- **THEN** the events show safe work and choice IDs.
- **AND** they show no plan, design, or review text.

### Requirement: Show review and approval coverage

For each design round, the view SHALL show what each check and gate visit covers. It SHALL name the whole plan version and design for each one. It SHALL mark an old plan choice as not current for a new plan version. It SHALL mark proof or a choice as stale if its head or files do not match the draft.

After a checked merge, the view SHALL show the fresh choice as current for the whole plan version. It SHALL keep the old and new work in time order. It SHALL also keep each choice, actor, head, and merge proof.

#### Scenario: Changed work awaits a fresh choice

- **WHEN** a design candidate changes approved plan text and has not been approved.
- **THEN** the view says that the old plan choice does not cover the new plan version.
- **AND** it asks for a fresh choice.

#### Scenario: Old review proof is shown

- **WHEN** review proof names a prior candidate head or plan hash.
- **THEN** the view marks it stale and shows which candidate it covered.

#### Scenario: The changed work is approved and merged

- **WHEN** a fresh design gate choice and merge proof match the changed candidate.
- **THEN** the view marks that choice as current.
- **AND** it keeps the old choice in history.

#### Scenario: A person checks the approval trail

- **WHEN** a person opens the history for a plan changed during Design.
- **THEN** the view shows the plan choice, design edit, fresh choice, and checked merge in order.
