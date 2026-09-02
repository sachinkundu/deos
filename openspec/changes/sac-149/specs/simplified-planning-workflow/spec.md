## ADDED Requirements

### Requirement: Review every design before its human gate

The current default flow SHALL place design review work between each design author turn and the next design human gate visit. For the first design, it SHALL run a private self-check, publish the valid draft, and run an independent review on the exact pull request head. For a later design change, it SHALL skip the self-check and run the independent review on the changed head.

If the author response changes the design, the flow SHALL publish that response and get final independent proof for the new head. The flow MUST NOT enter the design human gate until the proof needed for that round is complete and current.

#### Scenario: First design is ready

- **WHEN** the first design has a valid self-check and current independent proof for its pull request head.
- **THEN** the flow enters the design human gate with both results bound to that visit.

#### Scenario: Later design change is ready

- **WHEN** a changed design has current independent proof for its new pull request head.
- **THEN** the flow returns to the design human gate without another self-check.

#### Scenario: Required design proof is not current

- **WHEN** a needed result is missing, invalid, failed, or bound to another design head.
- **THEN** the flow does not enter the design human gate or claim that the design is ready for a person.

#### Scenario: Old run has a frozen graph

- **WHEN** a run uses an older saved graph with no design review jobs.
- **THEN** the run keeps that graph and does not add or guess the new review steps.
