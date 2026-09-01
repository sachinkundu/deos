## ADDED Requirements

### Requirement: Keep plan and design gate visits apart

The flow SHALL save which logical human gate is active for each visit. It SHALL also save the pull request and work type bound to that gate. A human choice SHALL use only the edges and saved pull request for that visit. The plan and design gates MAY use the same Linear states and visible human approval stage. They MUST NOT share visits, choices, pull requests, merge work, or change work.

#### Scenario: Both gates share one visible stage

- **WHEN** the saved graph has plan and design review visits.
- **THEN** the workflow view maps both visits to one human approval stage while the saved gate for each visit stays distinct.

#### Scenario: Plan change is asked for

- **WHEN** an allowed person moves the plan gate from `Human Review` to `In Progress`.
- **THEN** the flow saves a plan change choice and starts the plan change path for the saved plan pull request.

#### Scenario: Plan merge leads to design work

- **WHEN** an allowed person moves the plan gate from `Human Review` to `Merging`.
- **THEN** the flow saves plan merge approval, merges and checks the plan, and then starts design work.

#### Scenario: Design change is asked for

- **WHEN** an allowed person moves the design gate from `Human Review` to `In Progress`.
- **THEN** the flow saves a design change choice and starts the design change path for the saved design pull request.

#### Scenario: Design merge leads to the end

- **WHEN** an allowed person moves the design gate from `Human Review` to `Merging`.
- **THEN** the flow saves design merge approval and can end with success only after that merge is checked.

#### Scenario: An old gate event is seen again

- **WHEN** a late or replayed event names a past gate visit.
- **THEN** the flow does not apply that choice to the active gate or its pull request.

#### Scenario: Either gate is stopped

- **WHEN** an allowed person moves the active plan or design gate from `Human Review` to `Canceled`.
- **THEN** the flow saves the stop choice and ends as canceled without more work.
