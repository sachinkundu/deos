## 1. Fixed Review Contracts

- [x] 1.1 Package the pinned BettaView review bundle with its source revision and verify its immutable asset hashes
- [x] 1.2 Extend workflow job definitions with explicit author or reviewer role, provider, model, and reasoning configuration
- [x] 1.3 Add separate discovery and closed-set recheck schemas with strict trusted validation
- [x] 1.4 Add compatibility tests for existing frozen workflow definitions and digests

## 2. Trusted Candidates and Evidence

- [x] 2.1 Build the trusted planning candidate from repository bytes and run strict OpenSpec and readability checks outside the author agent
- [x] 2.2 Persist immutable candidate inputs and evidence in R2, then verify hashes by reading every object back
- [x] 2.3 Add D1 migrations and stores for planning candidates, review phases, review attempts, and exact-head bindings
- [x] 2.4 Implement compare-and-set phase transitions and direct review lookups without R2 scans
- [x] 2.5 Implement exact-input reuse, stale evidence rejection, and safe same-content head rebinding

## 3. Review Execution and Repair

- [x] 3.1 Run the author-model self-check in a fresh read-only Sandbox with the fixed BettaView bundle and bounded resources
- [x] 3.2 Add trusted OpenRouter model discovery, saved settings, per-run model freezing, and a capability-scoped Responses proxy with protected diagnostics
- [x] 3.3 Run the different-model independent review through the pinned Codex coding-agent harness in a fresh read-only Sandbox and preserve its transcript, provider turns, and required artifacts
- [x] 3.4 Implement immutable discovery baselines and closed-set rechecks that cannot add finding identifiers
- [x] 3.5 Derive review outcomes in trusted code and surface malformed proof, proof conflicts, and unresolved findings for human judgment
- [x] 3.6 Limit the self-check to three author-repair turns and keep the independent stage free of semantic repair loops
- [x] 3.7 Materialize accepted self-check feedback for repair and preserve independent feedback for author dispositions

## 4. Workflow and Provider Actions

- [x] 4.1 Separate planning authoring from trusted publication and remove direct GitHub publication capability from the author job
- [x] 4.2 Add an immutable simple-workflow version with self-check inside planning, an independent review node, same-PR author response, and the existing human gate
- [x] 4.3 Keep the new workflow selector disabled while preserving older frozen runs and workflow versions
- [x] 4.4 Create or update one exact-head GitHub Check Run with a stable review identifier and durable read-back
- [x] 4.5 Add one durable Linear portal link and concise review state without copying detailed findings
- [x] 4.6 Add an authenticated, idempotent retry for the latest cleaned-up failed independent review attempt while preserving the run, candidate, PR, and prior evidence

## 5. Review Portal

- [x] 5.1 Add authenticated OpenRouter model settings APIs and UI with active-run locking and different-model validation
- [x] 5.2 Add D1 review projections and guarded R2 artifact routes with hash verification and no-store responses
- [x] 5.3 Add the run review page with rounds, provenance, findings, citations, reuse, staleness, proof conflicts, and needs-judgment states
- [x] 5.4 Link the review page from the Create Planning PR popup without adding a separate self-check graph node

## 6. Validation and Documentation

- [x] 6.1 Add migration, schema, orchestration, storage, provider, and portal tests for the approved failure and reuse cases
- [x] 6.2 Run the full test, typecheck, build, strict OpenSpec, and readability validation suites
- [x] 6.3 Update the current architecture document and implementation evidence with the as-built selector-off boundary
- [x] 6.4 Verify deployable Worker, portal, container, migration, and settings packaging without activating the live workflow or canary
- [x] 6.5 Persist trusted deterministic-rejection feedback and stop a byte-identical rejected plan before another author-model retry
- [x] 6.6 Run deterministic author checks as a bounded same-session completion hook and remove workflow-level deterministic author retries
- [x] 6.7 Prove the read-only Codex/OpenRouter tool loop, trusted malformed-output rejection, secret boundary, tests, deploy, and durable provider diagnostics
- [x] 6.9 Update BettaView to run fresh proposal-first and requirement-first semantic passes and reconcile confirmed and disputed links without rejecting one-sided claims
- [x] 6.10 Render confirmed, proposal-only, and requirement-only links with both pass rationales in BettaView and the DEOS review portal
- [x] 6.11 Make a structurally valid independent review complete as `pass`, send every concern and disputed link to one author response, and preserve each author disposition
- [x] 6.12 Update the same pull request and provider summaries with review and author-response counts before entering human review without an independent semantic recheck loop
- [x] 6.13 Add focused prompt, schema, runner, workflow, evidence, provider, and portal tests for directional disagreement and author decline
- [x] 6.14 Add an authenticated, auditable version 11 to version 12 retry handoff for the exact cleaned-up `independent_discovery` failure while preserving the run, candidate, pull request, and prior evidence
- [ ] 6.8 Rerun the real Linear canary and preserve the author, two-pass review, author response, provider, and portal proof
