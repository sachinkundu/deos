## ADDED Requirements

### Requirement: Show design review work and exact proof

The workflow view SHALL show each design review round, its result, and its evidence. Each independent check SHALL show the exact pull request head that it checked.

The view SHALL show no self-check for a later design round. It SHALL mark proof as stale when it does not match the current review input. It MUST NOT add review steps to an old frozen graph.

#### Scenario: First design checks are active

- **WHEN** a run is checking its first design.
- **THEN** the view shows the self-check and independent review and does not mark human review as ready too soon.

#### Scenario: Later design check is active

- **WHEN** a run is checking a design changed after human feedback.
- **THEN** the view shows the new independent review round and shows that no self-check is due.

#### Scenario: Exact head proof is ready

- **WHEN** the current independent result is bound to the saved design pull request head.
- **THEN** the view shows that head, the result, and a link to the protected evidence.

#### Scenario: Saved proof is stale

- **WHEN** a result is bound to an older design head or review input.
- **THEN** the view marks it stale and does not show the current design gate as ready.

#### Scenario: Old run has no design checks

- **WHEN** a saved run uses a frozen graph from before design review checks were added.
- **THEN** the view shows the old graph and does not invent review work or proof.

#### Scenario: Complete context reaches a provider boundary

- **WHEN** valid review context is accepted locally but a provider or platform rejects it.
- **THEN** the workflow records the provider operation, failure class, and safe diagnostic needed to identify the real boundary.
