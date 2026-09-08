## Purpose

Let operators debug one failed attempt from its original evidence without rerunning paid work to recover a discarded error.

## ADDED Requirements

### Requirement: Preserve the source failure across execution boundaries

The system SHALL preserve each available original error message, stack trace, cause chain, provider status, response body, response headers, request identifier, and observation time. Provider adapters, capability routes, process runners, workflow state, and local diagnostics MUST NOT replace the original cause with only a category. Categories SHALL remain searchable labels beside the original evidence. The system SHALL retain original details in access-controlled diagnostics while excluding credentials from public responses and telemetry. Credential protection MUST NOT discard the rest of an error or its cause chain.

#### Scenario: Provider rejects a request

- **WHEN** OpenRouter, GitHub, or Linear returns an HTTP or GraphQL error
- **THEN** the operator can retrieve the original response details and available request and rate-limit headers for that operation, including Retry-After when present

#### Scenario: Stream fails after headers arrive

- **WHEN** a response body cannot be read to completion
- **THEN** the diagnostic retains the received status, headers, available body prefix, and read exception, and explicitly marks the response incomplete

#### Scenario: Runner or validation fails

- **WHEN** a supervisor, reviewer, validation command, or artifact operation fails
- **THEN** its original exception and available stdout, stderr, exit status, and signal remain linked to the attempt rather than being replaced by only supervisor_failed, codex_exit_nonzero, or invalid

#### Scenario: Local replay fails

- **WHEN** a local replay encounters a provider, subprocess, or evidence-read failure
- **THEN** it saves the original diagnostic, reports failure with a nonzero exit status, and does not report a successful test because the child exited zero

### Requirement: Keep the first cause visible through retries and secondary failures

A wrapper or repeated request SHALL preserve the original failure identity and details. When no new provider call occurs, a repeated failed model request SHALL expose the recorded provider status and diagnostic rather than substituting a generic replay-conflict error. Unknown or pending operations SHALL remain distinct from confirmed failures. Failures while saving diagnostics, collecting evidence, or cleaning up SHALL be recorded as secondary failures, not replacements for the first cause. This requirement MUST NOT authorize duplicate provider effects or automatic retries.

#### Scenario: Rate-limited request is repeated

- **WHEN** a request previously failed with provider HTTP 429 and the caller repeats it without a new provider attempt
- **THEN** the caller and operator still receive the recorded 429 cause and diagnostic reference rather than an unrelated 409 or 502

#### Scenario: Diagnostic persistence fails

- **WHEN** saving the original failure also fails
- **THEN** both errors remain available through the surviving execution record, the system reports which evidence is not durable, and recoverable evidence is retained for collection

### Requirement: Do not impose arbitrary diagnostic size limits

The system SHALL NOT truncate or reject diagnostic bodies, process output, error messages, or artifact evidence based on application-imposed byte limits. A platform or provider failure SHALL be reported with its actual details and the affected evidence identity. The system MUST NOT claim complete evidence when capture or storage is incomplete. Compact displays SHALL link to the complete stored evidence rather than truncate storage.

#### Scenario: Large error or artifact is captured

- **WHEN** error evidence exceeds a former application size cap
- **THEN** the system attempts to preserve the full evidence without generating an application size-limit failure

#### Scenario: Storage rejects an artifact

- **WHEN** the storage provider rejects evidence because of its own limit or another failure
- **THEN** the actual storage error is recorded as a secondary failure, the artifact is marked not durable, and remaining recoverable evidence is not destroyed

### Requirement: Show original failures to the authorized operator

The authenticated portal SHALL expose the failed stage's original cause, provider status when present, diagnostic reference, and secondary failures. The operator SHALL be able to retrieve complete retained evidence without manual database queries. Diagnostic retrieval failures SHALL display their own cause without replacing the original workflow failure. Historical records without retained details SHALL explicitly report that those details are unavailable.

#### Scenario: Operator opens a failed stage

- **WHEN** an authorized operator opens an attempt with a provider failure
- **THEN** the view shows that provider's original error and offers access to its full retained diagnostic rather than showing only a generic execution category

#### Scenario: Old record lacks details

- **WHEN** a historical attempt retained only an error category
- **THEN** the portal reports the category and states that original details were not retained, without inferring a more specific cause

### Requirement: Prove error preservation across boundaries

Acceptance SHALL include provider-originated failure evidence passing through the deployed diagnostic path to protected storage and the authenticated operator view. Controlled fault injection SHALL separately cover stream interruption, diagnostic-storage failure, large output, runner exceptions, and repeated failures. Reports MUST distinguish live provider proof from injected and unit-test evidence. Proof runs MUST NOT retry or advance SAC-156 without separate operator authorization.

#### Scenario: Delivery evidence is reviewed

- **WHEN** the change is presented as complete
- **THEN** the evidence identifies the live provider failure and its retrieved operator diagnostic, and separately lists which failure modes were injected or tested locally
