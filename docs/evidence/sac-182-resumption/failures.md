# SAC-182 resumption failure log — 20 September 2026

Scope: retire SAC-246 and resume SAC-182 through its existing approved planning/design gates to an implementation PR. Cloudflare agents own app code, tests, demos and proof. Supervisor may repair workflow support, answer routine questions, and advance authorized gates. No new production feature rollout is implied.

## Supervisor-fixed

- OPS-01: Initial read-only D1 query used nonexistent `implementation_environments.environment_id`. Cloudflare returned HTTP 400, code 7500, `no such column: environment_id at offset 7: SQLITE_ERROR`. Corrected the inventory query to read the table's actual records. No state mutation occurred.

## Automatically recovered

- AUTO-01: On restart, current main had advanced. The existing base-change path updated the tested base to d7a7c94 and re-entered demo planning at visit64. It preserved the approved design, original patch base and saved patch. New context includes sandbox-local Chromium and the scoped temporary environment capability. No feature conflicts have been manually resolved.

## Still requires fixing

- Prior SAC-182 PR137 feedback: real changed-service proof is missing; prior provider demo substituted a continuation stub; settings screenshot showed authentication failure; PR body contains a long task list instead of concise proof.
- Verify the resumed v43 run completes a real demo and resolves current-main conflicts; restart alone is not proof.

## Follow-up findings

- CLEANUP-01 (supervisor recovery): SAC-246's Workflow timed out on 19 September while waiting at its human gate: `Execution timed out after 86400000ms`. Its genuine cancellation delivery `e04f7713-a739-4c27-a790-432a5b7f37dd` reached D1 but stayed pending because the provider engine had errored. Restarted only that stopped engine from saved D1 and sent a wake containing that existing delivery ID. D1 consumed the original signed event and reached `canceled` at 2026-09-20T10:55:32.015Z. The 24-hour human-wait timeout and automatic recovery of pending wakes remain workflow follow-ups; no cancellation or approval was fabricated.
- RESUME-01 (supervisor workflow fix): SAC-182 retry `01a0be6e-0116-7c63-880c-f17eb534dd17` failed because the retry allocator reused September 15's demo context with a newer prompt. `cat context/runtime-capabilities.json` was rejected because that old inventory lacked the path. Source patch, approvals and diagnostics remain durable. Demo retries now rematerialize trusted context like implementation retries while keeping the pinned model and retry lineage.
- RESUME-02 (supervisor workflow extension): SAC-182's frozen policy contained only its scoped GitHub/Linear adapter, so it could not use the newly built temporary environment broker. Added explicit operator-only `enableTemporaryEnvironment: true` on a reviewed activation-only upgrade. It retains existing adapters, stores the new checked input as an immutable artifact, audits both identities, checks stopped state and cleanup, and preserves all app work and approved sources. The agent still receives no general Cloudflare credentials or production permission.
- TEST-01 (local test harness): The new preservation test initially compared a SQLite null-prototype row with a plain object. Normalized only the test comparison; production behavior was unaffected.

- Deployment verification: PR144 passed all CI checks, merged, and backend version 52962b2e-f407-4d4e-bbb9-20a9a57caab0 activated at 100%. The audited v43 grant and same-stage retry were accepted. Live-run validation remains in progress.
