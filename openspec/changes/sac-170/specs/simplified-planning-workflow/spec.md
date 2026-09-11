## ADDED Requirements

### Requirement: Use the short review cycle in new flow versions

A new fixed flow version SHALL use the bounded plan and design review cycle. It SHALL keep self-review inside each first author step. It SHALL run one independent stage after each first post. Later human edits SHALL return to the same human gate after trusted checks, with no new semantic review.

Each run SHALL keep the flow ID, version, graph, job rules, review rules, and model routes saved when it starts. Registering or selecting the new version MUST NOT change an active or past run or its saved proof.

#### Scenario: New run selects the new version

- **WHEN** a new run selects the fixed version with the short review cycle.
- **THEN** its plan and design phases use that cycle for the life of the run.

#### Scenario: Old run resumes

- **WHEN** a run with an older fixed graph resumes after the new version is ready.
- **THEN** it keeps its saved graph, review rules, model routes, and proof.

#### Scenario: Human asks for another edit

- **WHEN** a run on the new version returns from a plan or design human gate.
- **THEN** the graph starts the set author edit path and skips all semantic review nodes for that edit.
