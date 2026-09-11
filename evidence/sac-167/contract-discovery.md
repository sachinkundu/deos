# SAC-167 contract discovery

Checked on 11 September 2026 against merged design PR #102 and planning PR #101.
Claude Code version: 2.1.268. SDK type declarations checked: 0.3.268.

## Observed provider behavior

Three real local client trials used a temporary credentials JSON exported from the existing macOS Keychain login. The JSON file used mode 0600 in a temporary directory. Neither trial passed an API key, setup token, or alternate API endpoint. Temporary directories were removed after each trial. All credential copies were unchanged at completion.

The second trial used an explicit system prompt, no built-in tools or MCP servers, no inherited user/project/local settings, and disabled nonessential traffic. Its actual model usage contained only `claude-opus-5`. A trusted Stop hook reported applied effort `high`. The result was successful and terminal. A provider rate-limit event reported `isUsingOverage: false`, `overageStatus: rejected`, and `overageDisabledReason: org_level_disabled`.

The first trial used the default system prompt and also recorded an auxiliary Haiku call. Do not accept that invocation profile as proof of an Opus-only review. The second profile removes that observed extra call, but tool-enabled review behavior still needs a separate trial.

The signed-in browser usage page showed Pro, usage credits off, zero balance, zero spent, and auto-reload off before the trials. List-price estimates in client output are not payment receipts.

This is real provider execution from a local test. It is not a deployed DEOS review, signed Linear ingress proof, or release evidence.

## Facts still required before adapter implementation

- Establish ownership of the refreshable login between the Mac and DEOS. A cloud D1 lease cannot serialize a local client that uses the same login. The current design covers concurrent cloud attempts but does not settle local-client ownership.
- A third trial confirmed that the fresh client populates account identity after a successful provider invocation. Before that first contact, `claude auth status` reports Pro but no account identifier. Account binding must be checked after authenticated profile discovery; copying pre-existing cached metadata is not proof of a token match. The saved identity evidence records only presence, not raw identifiers.
- Validate the tool-enabled contract and clear auth/quota failures. Do not manufacture exhaustion of the real account to test quota handling.
- Confirm refresh behavior and interruption recovery. No refresh was triggered in these short trials, so they provide no refresh or recovery proof.

## Primary references

- https://code.claude.com/docs/en/authentication
- https://code.claude.com/docs/en/model-config
- https://code.claude.com/docs/en/agent-sdk/typescript
- https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan

The current subscription notice pauses the proposed separate Agent SDK credit change: headless CLI usage still draws from subscription limits. SDK declarations document `BaseHookInput.effort.level` as the active effort after a model downgrade and `SDKRateLimitInfo` as subscription quota metadata. Live trials confirmed the Stop hook and rate-limit fields used above.

## Tool and session trial, 11 September

The real local setup-token trial ran the trusted driver, pinned client, and MCP
broker. It read a sample README, reused the client session for a follow-up,
and started an isolated session for the second direction. All three completed
with Opus 5, applied high effort, and subscription quota evidence showing no
paid usage. See `tool-session-contract.json`. This is local provider proof;
it is not the deployed workflow canary.

The client emits quota status changes, not a new quota event for every repair.
The driver retains observed quota events within that live client session and
clears them when starting the other direction. Receipts label this evidence
as `same_client_session`. Missing initial evidence or any conflicting event
fails the review.

A failed tool trial exposed automatic fallback to Opus 4.8. Its receipt was
rejected. The runner now sets `switchModelsOnFlag: false` and an empty fallback
chain. A later real refusal emitted `model_refusal_no_fallback` with only Opus 5
usage and failed closed. This follows the [documented noninteractive fallback
control](https://code.claude.com/docs/en/model-config#ask-before-switching).
No refusal is treated as a completed semantic review.

A real invalid-token request returned `api_error_status: 401`,
`terminal_reason: api_error`, `is_error: true`, and empty model usage.
The validator classified it as `auth_failure` without requiring a Stop hook.
The client emitted two API retry notices before that terminal failure.
Quota exhaustion uses the provider's `rate_limit_event` rejection and epoch
seconds reset field. Exhaustion was not deliberately induced on the account;
quota-stop and interruption controls also have fault-injection coverage.

## Live schema contract

The first two SAC-168 external review attempts stopped before a model call.
The exact live schema reproduced this Claude Code 2.1.268 error in the pinned Linux image:
`--json-schema is not a valid JSON Schema: no schema with key or ref "https://json-schema.org/draft/2020-12/schema"`.
The CLI adapter omits the root dialect declaration for its shared schema keyword subset.
The full original schema remains in the prompt, turn digest, and DEOS result validation.

The exact live schema passed a real Linux client call after this adaptation:
Claude Code 2.1.268, Opus 5, high effort, Claude Pro, paid usage false,
and organization overage disabled. This isolates the schema fix; it is not
evidence that the deployed workflow review has passed.
