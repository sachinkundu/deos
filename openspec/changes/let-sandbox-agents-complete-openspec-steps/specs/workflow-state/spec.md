## ADDED Requirements

### Requirement: Evaluate repository-local OpenSpec agent outcomes without synthetic action receipts

The Workflow SHALL model configured OpenSpec progression as agent nodes rather than trusted system-action nodes. It SHALL accept a schema-valid completed result with complete durable attempt artifacts and no provider operations as sufficient evidence for a repository-local OpenSpec node, and SHALL follow only the completed edge encoded for that node. It MUST NOT require or manufacture an `openspec.*` provider receipt for repository-local work. If the attempt performs any external provider operation, every declared operation MUST still have an exact successful or reconciled D1 receipt before a completed result can advance.

#### Scenario: Repository-local OpenSpec work completes without an external effect

- **WHEN** a configured OpenSpec agent returns a schema-valid completed result, its required artifacts are durably preserved, and the attempt has no provider operations
- **THEN** the Workflow records the agent outcome and follows the node's configured completed edge without requiring an OpenSpec system-action receipt

#### Scenario: OpenSpec agent also performs an external provider operation

- **WHEN** a configured OpenSpec agent returns completed after attempting a GitHub, Linear, deployment, or other external provider effect
- **THEN** the Workflow follows the completed edge only when the result's provider receipts exactly match the attempt's provider operations and every matched operation is successful or reconciled in D1

#### Scenario: OpenSpec agent external effect is incomplete

- **WHEN** a configured OpenSpec agent reports completed but an attempted provider operation is missing, denied, failed, ambiguous, or absent from the structured result
- **THEN** the Workflow rejects the success transition and does not treat repository-local completion as proof of the external effect

#### Scenario: OpenSpec agent reports blocked or failed

- **WHEN** a configured OpenSpec agent returns a schema-valid blocked or failed result
- **THEN** the Workflow records that result and follows only the matching blocked or failed edge from the current node

#### Scenario: Agent output attempts to select progression

- **WHEN** an OpenSpec agent names a target node or Linear state in its output
- **THEN** the Workflow ignores that request, records any applicable contract violation, and selects progression only from the current frozen definition and validated outcome

#### Scenario: Terminal OpenSpec completion has no later artifact consumer

- **WHEN** a schema-valid OpenSpec completion has complete durable artifacts, no incomplete provider operation, and no configured downstream semantic consumer
- **THEN** the Workflow trusts the terminal completion and follows its configured edge without adding a speculative artifact-verification action

### Requirement: Keep evidence verification phase-correct

The Workflow SHALL describe evidence-verification duties according to the review node's position in the frozen graph. A pre-release review MUST evaluate the restored implementation and evidence applicable at that phase, and MUST NOT require native verification, release, deployment, finalization, sync, or archive outputs that can only be produced by downstream nodes. Trusted enforcement of immutable job identity, complete manifests, patch integrity, Sandbox cleanup, and provider receipts SHALL remain outside the credentialless review agent.

#### Scenario: Repository-local implementation reaches pre-release evidence review

- **WHEN** a repository-local implementation has no provider integration or user-interface surface and reaches evidence verification before native OpenSpec verify
- **THEN** the review evaluates deterministic implementation evidence without requiring inapplicable provider or visual proof or any downstream verify, release, sync, or archive result

#### Scenario: Implemented feature has an applicable provider surface

- **WHEN** the acceptance criteria include provider integration or user-interface behavior that is already implemented at the evidence-verification node
- **THEN** the review distinguishes and requires the applicable deterministic, synthetic, provider-originated, and visual proof without requesting platform credentials or duplicating controller integrity checks
