# SAC-182 resumption failure log — 20 September 2026

Scope: retire SAC-246 and resume SAC-182 through its existing approved planning/design gates to an implementation PR. Cloudflare agents own app code, tests, demos and proof. Supervisor may repair workflow support, answer routine questions, and advance authorized gates. No new production feature rollout is implied.

## Supervisor-fixed

- OPS-01: Initial read-only D1 query used nonexistent `implementation_environments.environment_id`. Cloudflare returned HTTP 400, code 7500, `no such column: environment_id at offset 7: SQLITE_ERROR`. Corrected the inventory query to read the table's actual records. No state mutation occurred.

- AUTH-01: Implementation startup failed at visit65, before model work, with OpenAI `refresh_token_reused` and `token_expired`. Cloud auth last refreshed September9 and expired September19; the same-account local copy refreshed September20 and expires September30. With no active attempts or credential leases, a temporary exact-body authenticated maintenance version conditionally refreshed only the encrypted R2 credential. It verified decrypt/readback without exposing credentials or changing the encryption key. Original backend version/resources restored at100%; authenticated maintenance route returns404. One supported same-stage build retry established at11:16:21 UTC. This is supervisor recovery, not automatic recovery; the same stale-cloud-copy failure occurred in SAC-151 and is tracked by SAC-165.

## Automatically recovered

- AUTO-01: On restart, current main had advanced. The existing base-change path updated the tested base to d7a7c94 and re-entered demo planning at visit64. It preserved the approved design, original patch base and saved patch. New context includes sandbox-local Chromium and the scoped temporary environment capability. No feature conflicts have been manually resolved.

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
