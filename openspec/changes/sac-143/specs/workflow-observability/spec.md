## ADDED Requirements

### Requirement: Show the design review loop in the workflow view

The workflow view SHALL show the design part of the frozen graph for a run that has it. It SHALL show design work, design review, design merge and check, and the end state as clear stages. It SHALL keep the return path for design changes. The view MUST use saved run and visit data. It MUST NOT guess progress from Linear state or time. It MUST NOT change saved run data or a saved graph.

#### Scenario: Design work is active

- **WHEN** the saved run is at its design job or trusted design post step.
- **THEN** the view marks design work as active and shows the saved design pull request when it is ready.

#### Scenario: Design waits for a person

- **WHEN** the saved run is at the design human gate.
- **THEN** the view marks design review as waiting and links the needed choice to the Linear issue.

#### Scenario: A person asks for a design change

- **WHEN** the saved history returns from design review to design work.
- **THEN** the view shows the return path, keeps both visits, and raises the design work cycle count.

#### Scenario: Design merge is in progress

- **WHEN** the saved run is at the design merge or check step.
- **THEN** the view marks design merge and check as active and does not mark the run done.

#### Scenario: Design merge is checked

- **WHEN** the saved run has a successful end visit after the design merge check.
- **THEN** the view marks the design merge stage and the end stage as complete.

#### Scenario: An old run has no design stage

- **WHEN** a saved run uses an older frozen graph with no design nodes.
- **THEN** the view shows that older graph and does not add or guess a design stage.
