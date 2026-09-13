## ADDED Requirements

### Requirement: Continue new runs through implementation review

A new fixed flow version SHALL continue from a verified design merge to autonomous implementation and a final implementation human gate. It SHALL keep the existing plan and design gates. It MUST NOT add a task gate or a live release step.

Each run SHALL keep the flow ID, version, graph, job rules, access rules, and model routes saved when it starts. Registering or selecting the new version MUST NOT change an active or past run.

#### Scenario: New run selects the implementation flow

- **WHEN** a new run selects the fixed version with implementation enabled.
- **THEN** it uses the saved plan, design, implementation, and human review path for the life of the run.

#### Scenario: Old run reaches its end

- **WHEN** a run with an older fixed graph completes its design merge after the new version is ready.
- **THEN** it follows its old terminal edge and does not gain an implementation stage.

#### Scenario: Implementation flow reaches design approval

- **WHEN** a run on the new version completes and verifies its approved design merge.
- **THEN** it starts the saved implementation edge without a local prompt or a new human choice.
