## 1. Confirm the Claude contract

- [x] 1.1 Verify the approved Claude setup token, Opus 5, applied high effort, and subscription-only use in a real isolated client trial. Save sanitized observations.
- [x] 1.2 Reconcile the approved setup-token plan and design; keep the Mac login out of DEOS.
- [x] 1.3 Confirm token enrollment binding, auth failure, quota stop, and interrupted-call handling with the pinned client contract.

## 2. Implement the trusted provider boundary

- [x] 2.1 Add a Claude receipt validator that checks observed model, applied effort, account binding, subscription route, terminal result, and input binding.
- [x] 2.2 Run the pinned Claude client in a trusted runner separate from the review Sandbox. Broker only existing read-only tools and preserve prompts, context, schema, and repair limits.
- [x] 2.3 Add protected setup-token enrollment, captured secret-version checks, operator replacement, and cleanup of the separate trusted runner.
- [x] 2.4 Integrate attempt replay, clear auth/review/plan-limit causes, and retry-not-before enforcement without fallback.

## 3. Freeze and present the new workflow

- [x] 3.1 Add the fixed Claude profile to a new immutable definition and freeze its account binding for each new run. Preserve existing OpenRouter runs and legacy route settings.
- [x] 3.2 Reuse existing semantic validators and hash-checked proof publication. Require provider proof and cleanup before accepting a review.
- [x] 3.3 Show fixed Claude settings for the new definition and safe failure causes. Preserve prior-definition rollback and its required OpenRouter model.

## 4. Verify and deliver

- [ ] 4.1 Test both review phases, read-only tool scope, profile/account enforcement, token replacement and version conflicts, failed auth, quota stops, bad results, replay, cleanup, frozen runs, and rollback.
- [x] 4.2 Run repository checks and strict OpenSpec validation.
- [ ] 4.3 Deploy a dedicated canary using normal signed Linear ingress and verify the actual review, D1 authority, R2 hashes, token binding, cleanup, and unchanged human gates.
- [ ] 4.4 Attach sanitized visual and provider evidence, publish a review-ready implementation PR, and promote the new default only after all release proof passes.
