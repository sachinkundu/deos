# SAC-182 resumption failure log — 20 September 2026

Scope: retire SAC-246 and resume SAC-182 through its existing approved planning/design gates to an implementation PR. Cloudflare agents own app code, tests, demos and proof. Supervisor may repair workflow support, answer routine questions, and advance authorized gates. No new production feature rollout is implied.

## Supervisor-fixed

- OPS-01: Initial read-only D1 query used nonexistent `implementation_environments.environment_id`. Cloudflare returned HTTP 400, code 7500, `no such column: environment_id at offset 7: SQLITE_ERROR`. Corrected the inventory query to read the table's actual records. No state mutation occurred.

- AUTH-01: Implementation startup failed at visit65, before model work, with OpenAI `refresh_token_reused` and `token_expired`. Cloud auth last refreshed September9 and expired September19; the same-account local copy refreshed September20 and expires September30. With no active attempts or credential leases, a temporary exact-body authenticated maintenance version conditionally refreshed only the encrypted R2 credential. It verified decrypt/readback without exposing credentials or changing the encryption key. Original backend version/resources restored at100%; authenticated maintenance route returns404. One supported same-stage build retry established at11:16:21 UTC. This is supervisor recovery, not automatic recovery; the same stale-cloud-copy failure occurred in SAC-151 and is tracked by SAC-165.

- OPS-04 (supervisor read-only query correction): A status query requested nonexistent claude_review_invocations.started_at. Cloudflare returned HTTP400/code7500: `no such column: started_at at offset 35: SQLITE_ERROR`. Read the migration and corrected the query to created_at; no remote state changed.

## Automatically recovered

- AUTO-01: On restart, current main had advanced. The existing base-change path updated the tested base to d7a7c94 and re-entered demo planning at visit64. It preserved the approved design, original patch base and saved patch. New context includes sandbox-local Chromium and the scoped temporary environment capability. No feature conflicts have been manually resolved.

- AUTO-02: The cloud author completed the restored build at visit71 (12:07:57 UTC), reconciled against main915a6e8 and saved cumulative patch8e1d13d249949686f64a2544012e192fa45049e9854492cb773d079dede47185. Temporary environment and demo evidence are durable. Independent demo review has not passed, so this is build recovery, not feature acceptance.

- AUTO-03: After the reader repair advanced main, the demo-gate retry automatically entered rebasevisit76 and buildvisit77. Running attempt01a0bed0-61ad-7bf0-9b7e-cb61e814576d references the latest full cumulative patch8e1d13d... with its correct915a6e8 base, while testing againstdc612405. No saved implementation was discarded and no feature edits were made by the supervisor. Revalidation is pending.

- AUTO-04 (nonterminal read rejection, final review pending): At demo reviewvisit79, `cat context/checks.json` exceeded the262144-byte tool output limit. PR146 returned an explicit recoverable read error (exit2), retained original stacks in D1/R2, and left the Claude invocation running with no failure cause. Original diagnostic and invocation readback are saved as review79-read-limit-original.json and review79-status.json. The final review receipt is still pending, so this proves nonterminal handling, not completed review recovery. No supervisor retry was sent.

## Still requires fixing

- DIAG-02: An author returned `needs_human` because tasks.md was absent, but runtime.finish unconditionally read tasks.md and turned the clarification into supervisor_failed. The full question and root cause survived in result.json/validation.txt. Needs container completion-path repair; avoid deploying container changes over active work.


- AUTH-02: Shared credential refresh ownership/persistence remains unresolved (SAC-165). Reseeding repaired this run but does not prevent desktop/cloud copies becoming stale again. Stop if the new credential is rejected; do not retry unchanged invalid auth.
- DIAG-01: `trustGeneratedHooks` requests the model list after auth failure, then reports missing `/root/.codex/models_cache.json`. The original401 is preserved in supervisor stderr, but the terminal summary masks the actionable cause. Needs startup error classification and propagation; no container code changed in this recovery.


- Prior SAC-182 PR137 feedback: real changed-service proof is missing; prior provider demo substituted a continuation stub; settings screenshot showed authentication failure; PR body contains a long task list instead of concise proof.
- Verify the resumed v43 run completes a real demo and resolves current-main conflicts; restart alone is not proof.

## Follow-up findings

- CLEANUP-01 (supervisor recovery): SAC-246's Workflow timed out on 19 September while waiting at its human gate: `Execution timed out after 86400000ms`. Its genuine cancellation delivery `e04f7713-a739-4c27-a790-432a5b7f37dd` reached D1 but stayed pending because the provider engine had errored. Restarted only that stopped engine from saved D1 and sent a wake containing that existing delivery ID. D1 consumed the original signed event and reached `canceled` at 2026-09-20T10:55:32.015Z. The 24-hour human-wait timeout and automatic recovery of pending wakes remain workflow follow-ups; no cancellation or approval was fabricated.
- RESUME-01 (supervisor workflow fix): SAC-182 retry `01a0be6e-0116-7c63-880c-f17eb534dd17` failed because the retry allocator reused September 15's demo context with a newer prompt. `cat context/runtime-capabilities.json` was rejected because that old inventory lacked the path. Source patch, approvals and diagnostics remain durable. Demo retries now rematerialize trusted context like implementation retries while keeping the pinned model and retry lineage.
- RESUME-02 (supervisor workflow extension): SAC-182's frozen policy contained only its scoped GitHub/Linear adapter, so it could not use the newly built temporary environment broker. Added explicit operator-only `enableTemporaryEnvironment: true` on a reviewed activation-only upgrade. It retains existing adapters, stores the new checked input as an immutable artifact, audits both identities, checks stopped state and cleanup, and preserves all app work and approved sources. The agent still receives no general Cloudflare credentials or production permission.
- TEST-01 (local test harness): The new preservation test initially compared a SQLite null-prototype row with a plain object. Normalized only the test comparison; production behavior was unaffected.

- Deployment verification: PR144 passed all CI checks, merged, and backend version 52962b2e-f407-4d4e-bbb9-20a9a57caab0 activated at 100%. The audited v43 grant and same-stage retry were accepted. Live-run validation remains in progress.

- OPS-02: Verification initially inspected the script download endpoint, which returned the latest uploaded maintenance bundle despite original-version traffic restoration. That assertion stopped before retry request creation. Verified the original immutable version/resources and100% traffic instead, plus authenticated live maintenance-route404. The dependent retry command then failed locally because its request file did not yet exist; no external mutation occurred. Retry was sent only after verified restoration.

- RECOVERY-01 (supervisor workflow repair): Auth-startup failure captured a clean current-main snapshot. The next retry preferred this newer empty snapshot over the older full implementation, so the agent correctly stopped before rebuilding lost context. The original cumulative patch remains immutable in R2 and PR137. Empty failed snapshots now retain failure/evidence context while selecting the existing saved implementation and its patch base for restoration.
- RECOVERY-02 (supervisor workflow repair): Rebase conflicts retained the checked patch only under the root-owned /deos/run directory. The author shell runs as deos-author. The controller now also exposes the verified patch and original conflict report under author-readable /deos/output and tells the agent to reconcile them. No feature conflicts were resolved by the supervisor.

- RECOVERY-01/02 activation: PR145 merged after639 passing tests (one existing skip), type check and all CI checks. Backend53de6abf-e182-4caf-b6bc-bdf6f841449d activated at100%. At11:33 UTC the fresh running build job references the original full cumulative patch and original patch base. Feature reconciliation and real demos remain pending; no completion claim.

- REVIEW-01 (supervisor workflow repair, activated): Independent demo gate attempt01a0beb7-66ce-770c-b908-c84d81e96d36 at visit73 stopped at12:08:43 UTC after requesting `wc -l` over five checked candidate files. The reader accepted only one file and threw `unsupported read-only review arguments`; the Worker marked the whole Claude invocation failed, and the broker recorded a terminal failure. Original command, reader stack, Worker stack and exit status are in demo-review-read-original-error.json. The repair supports multi-file line counts and explicit recoverable argument/range/search/output-limit errors. The broker returns an MCP tool error so the same reviewer can correct its read; original diagnostics still reach D1/R2. Scope violations, hash mismatches, malformed reader responses, truncation, timeouts and transport failures still stop the review. Local validation:641 tests pass, one existing skip, typecheck passes. This changes general workflow support only; cloud-authored app code and proof are untouched.
- DIAG-03: The failed demo review manifest contains a zero-byte transcript.jsonl. Original reader and Worker diagnostics survived, but the interrupted independent-review conversation is not in that artifact. Investigate trusted-review transcript preservation separately; this does not invalidate or overwrite the author demo evidence.
- TEST-02 (local test harness): Recovery regression initially looked up a receipt through the pre-save turn object and saw null. Read back the persisted turn before asserting the receipt; production code unchanged by this test correction.

- OPS-03 (local validation setup): The Docker daemon could not bind-mount a laptop /private/tmp request file (`invalid mount config ... bind source path does not exist`). Copied each saved fixture request through Docker's file API instead, then ran the same immutable image with networking disabled. All four cases passed (original five-file wc, recoverable unsupported flag, corrected read and denied outside path); disposable test containers were removed. No production or feature resources were changed by these checks.

- REVIEW-01 activation: PR146 merged asdc612405 after all CI checks. Worker4ac2198a-13d5-4e11-9f24-e7ffefba7939 is active at100%; all four container pools completed replacement with imageee9ac88146b610538822bc1dfe1a3743c46678d3747030337eabb183a68ecb63 at100%, four healthy instances each and no failed instances. Fresh D1 showed no active attempts before the supported same-stage demo-gate retry was established at12:35:08 UTC. Saved cumulative patch8e1d13d... and accepted demo plan were retained. Live independent review is still pending; no feature acceptance claim.
