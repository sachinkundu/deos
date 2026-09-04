## 1. Review evidence contracts and storage

- [x] 1.1 Add additive D1 tables and constraints for design review rounds, attempts, findings, dispositions, and exact-head gate bindings.
- [x] 1.2 Add typed design-review input, result, finding, disposition, and evidence-manifest contracts with bounded validation.
- [x] 1.3 Persist create-only review inputs and results in R2 and accept them only after digest-verified read-back.
- [x] 1.4 Add storage tests for immutability, uniqueness, retries, current-result selection, and foreign-key enforcement.

## 2. Canonical design review coordination

- [x] 2.1 Build canonical self-check inputs from the validated private candidate, approved plan, base, guidance, and saved author model settings.
- [x] 2.2 Build canonical independent-review inputs from bytes read at the exact design pull request head and the saved outside model settings.
- [x] 2.3 Validate structured review results and stable finding identities without giving the reviewer write or provider capabilities.
- [x] 2.4 Collect one bounded author disposition for every independent finding and validate the resulting candidate when the design changes.
- [x] 2.5 Enforce the three-turn semantic repair and response bounds with typed failures and cleanup-aware retry behavior.
- [x] 2.6 Add deterministic tests for clean reviews, concerns, malformed proof, model failure, and exhausted repair loops.

## 3. Frozen workflow and trusted publication

- [x] 3.1 Add self-check, repair, independent review, author response, republish, and recheck jobs and nodes to a new frozen workflow definition.
- [x] 3.2 Keep later human design rounds on the same pull request, skip self-check, and require a fresh independent review of the changed head.
- [x] 3.3 Delay first design publication until self-check acceptance and reconcile every GitHub write to the deterministic branch, pull request, and confirmed head.
- [x] 3.4 Make duplicate deliveries and node replays reuse stable round, traversal, candidate, review-attempt, and provider-operation identities.
- [x] 3.5 Prove old saved workflow definitions restore without invented design-review nodes.

## 4. Exact-head gate eligibility and human authority

- [x] 4.1 Implement the atomic design-gate eligibility predicate for current plan, base, guidance, models, candidate, pull request identity, head, results, and dispositions.
- [x] 4.2 Mark prior proof historical or stale when the candidate, pull request head, plan, base, guidance, model, or unresolved work changes.
- [x] 4.3 Bind accepted result identities and the exact reviewed head immutably to each design human-gate visit.
- [x] 4.4 Preserve signed user-only revision, merge, and cancel authority and reject agent, check, comment, or non-user approval signals.
- [x] 4.5 Add race, replay, stale-head, stale-context, incomplete-disposition, and unauthorized-approval tests.

## 5. Protected operator evidence

- [x] 5.1 Extend the protected workflow view with design review rounds, phases, models, outcomes, findings, dispositions, evidence links, and exact reviewed heads.
- [x] 5.2 Label the initial self-check as historical after a later edit and label self-check as not required for later human revision rounds.
- [x] 5.3 Keep raw evidence behind the allowlisted hash-verifying no-store route and publish only bounded safe GitHub and Linear summaries.
- [x] 5.4 Add portal and API tests for active, ready, stale, later-round, failed, and old-definition presentation.

## 6. Validation, deployment, and live canary

- [x] 6.1 Run TypeScript, Python, schema, formatting, OpenSpec, migration, and Worker dry-run validation.
- [x] 6.2 Deploy the additive migration, Worker, portal, and a new workflow definition without mutating runs frozen to older definitions.
- [x] 6.3 Register and select the new definition only after remote read-back confirms its graph, digest, selectors, and policy state.
- [x] 6.4 Create a routed sample-project canary for a readable CLI that fetches wallpapers from Bing and Unsplash and applies them on Ubuntu GNOME.
- [ ] 6.5 Follow the canary through private self-check, exact-head independent review, human design approval, implementation, tests, and terminal workflow state.
- [ ] 6.6 Capture provider-originated Linear and GitHub state, D1/R2 evidence, sandbox cleanup, CLI test output, and visual proof for the final implementation PR.
- [x] 6.7 Remove arbitrary local content-size and item-count ceilings from valid planning, design, and review context, preserve complete inputs, and expose actual provider or platform failures.
