## Purpose

Run each outside OpenSpec review through Claude Pro with fixed model rules, safe limits, and proof that people can trust.

## ADDED Requirements

### Requirement: Use one fixed Claude review setup

Each new flow version SHALL use Claude Opus 5 for every outside plan and design review. Its reasoning effort SHALL be `high`. The trusted runner SHALL use the user's existing local Claude auth JSON, as Codex does. The flow MUST NOT ask the user to sign in. It MUST NOT send an Anthropic API key or use OpenRouter or a fallback model for this work.

#### Scenario: Outside plan review starts

- **WHEN** a new flow starts an outside review of a posted plan.
- **THEN** it uses Claude Opus 5 with high effort and the local Claude auth JSON.

#### Scenario: Outside design review starts

- **WHEN** a new flow starts an outside review of a posted design.
- **THEN** it uses Claude Opus 5 with high effort and the local Claude auth JSON.

#### Scenario: Review requests another route

- **WHEN** an outside review asks for OpenRouter, an API key, or another model.
- **THEN** DEOS rejects the job before it can make accepted review proof.

### Requirement: Keep the review contract the same

The provider cutover SHALL change only the outside model route and its proof. Each review SHALL keep its exact files and head, full valid context, prompt, read-only tools, result shape, proof checks, and stale rules. It SHALL keep all rounds, retries, stop limits, author replies, and human gates. Codex author and self-check work SHALL keep its current model, input, role, and limits. A valid concern SHALL stay advice for the author and a person. A review result MUST NOT approve a human gate.

#### Scenario: Claude reviews a plan

- **WHEN** Claude runs an outside plan review.
- **THEN** it gets the same complete plan input, review rules, and result contract used by that stage before the cutover.

#### Scenario: Claude reviews a design

- **WHEN** Claude runs an outside design review.
- **THEN** it gets the same complete design, approved plan, repo guide, review rules, and result contract used by that stage before the cutover.

#### Scenario: Codex work runs after the cutover

- **WHEN** the flow starts Codex author or self-check work.
- **THEN** that work uses the same model, input, role, and limits as before the cutover.

#### Scenario: Claude reports a concern

- **WHEN** a valid review result has one or more concerns.
- **THEN** the author records each set reply and the flow keeps the same later human gate.

### Requirement: Stop safely at account and review limits

DEOS SHALL record a clear stop result when the local Claude auth JSON is missing or cannot be used. It SHALL do the same when the Pro plan limit is met or the cloud review fails. None of these results may count as a passed review. The flow SHALL use its set retry or stop rule, but MUST NOT try another model or provider. It MUST NOT open the next human gate without valid review proof. The protected review view SHALL show the cause only for a failed or stopped review.

#### Scenario: Local auth cannot be used

- **WHEN** the local Claude auth JSON is missing, expired, revoked, or invalid.
- **THEN** the review records an auth failure and cannot pass.

#### Scenario: Pro plan limit is met

- **WHEN** Claude reports that the local account plan cannot run more work.
- **THEN** the review stops with a plan-limit result and starts no fallback.

#### Scenario: Cloud review fails

- **WHEN** the Claude cloud call or review process fails before a valid result is saved.
- **THEN** the review records a failed result and cannot open the next human gate.

#### Scenario: A later retry is allowed

- **WHEN** the current flow rules allow a retry after an auth, limit, or review failure.
- **THEN** the retry uses the same Claude Pro route and all current job and stop limits.

### Requirement: Keep frozen runs and old proof stable

A run SHALL keep the provider, model, effort, and flow rules saved when it began. A new run that selects the Claude flow SHALL use the fixed Claude setup and SHALL ignore an old OpenRouter model choice. The settings portal SHALL show that fixed setup and MUST NOT offer an OpenRouter model choice. An older frozen run MAY keep its saved provider path. Old review proof SHALL remain readable and MUST NOT be relabeled as Claude proof.

#### Scenario: New run starts after the cutover

- **WHEN** a run selects the new Claude flow version.
- **THEN** it saves Claude Opus 5, high effort, and Claude Pro as fixed review facts.

#### Scenario: Old run resumes

- **WHEN** a run with a frozen OpenRouter flow resumes after the cutover.
- **THEN** it keeps its frozen rules and its proof keeps the old provider name.

#### Scenario: Operator views the settings portal

- **WHEN** an operator opens the settings portal for the new Claude flow.
- **THEN** the view shows the fixed Claude setup and no OpenRouter model choice.

#### Scenario: Old model setting remains in storage

- **WHEN** a new Claude run reads settings that still hold an OpenRouter model choice.
- **THEN** it does not use that choice for any outside review.

### Requirement: Prove the real Claude cloud path

Release proof SHALL include at least one real outside review from the deployed flow. The internal proof SHALL show the exact review input, Claude Opus 5, high effort, the result, and the Claude Pro route. A local mock, fake result, or direct test request MUST NOT count as this cloud proof. The proof SHALL include a safe data read-back and clear screen images of the provider setup and the resulting review state. It MUST NOT expose the local auth JSON. A passed review view MUST NOT show these internal facts. A failed or stopped review view SHALL show only its cause.

#### Scenario: Real cloud review completes

- **WHEN** the deployed flow gets a valid review result from Claude through the local auth JSON.
- **THEN** durable proof ties the input, model, effort, Claude Pro route, and result to that review.

#### Scenario: Only synthetic proof exists

- **WHEN** tests pass but no deployed review reached the real Claude cloud service.
- **THEN** DEOS does not claim that the provider cutover is proved.

#### Scenario: Proof could expose sign-in data

- **WHEN** a proof item contains the local auth JSON, a token, a cookie, or another auth file.
- **THEN** DEOS does not accept or show that unsafe proof.
