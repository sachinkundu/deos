# Claude external review

New Claude runs use the fixed Opus 5 / high profile. Codex still writes and checks
the work. Existing runs keep their frozen provider, prompts, model and workflow.
The `DEOS Claude` selector is for controlled rollout. The prior
`DEOS Traceability` definition and its OpenRouter model setting remain available
for rollback.

## Enroll or replace a setup token

Confirm the intended Claude account is on Pro and usage credits are off. Save
sanitized evidence. Put the setup token in the ignored local `.env` as
`CLAUDE_SETUP_TOKEN`. Do not copy the Mac Claude login or refresh credentials.

Run `scripts/enroll-claude-review.py --help` for the required arguments. Use one
stable opaque account binding for the enrolled account. Each replacement token
must have a new secret version. The script stores the token and enrollment key
as Worker secrets and writes a keyed token fingerprint to D1. It never logs the
token. The account binding is an operator assertion, not an identity returned by
Claude. The script rejects replacement with a different account binding.

The token/version update is atomic. D1 metadata follows the secret update. If
that second write fails, new calls stop until the same enrollment command
completes. A running client retains its captured token version. A replay never
starts another client to hide an uncertain result.

## Inspect a run

Use `scripts/inspect-claude-review.py --env-file <ignored-env-file> --issue-id
<Linear-UUID> --check-r2`. It reads D1 and checks each protected receipt against
its recorded R2 hash. It prints allowlisted model, effort, billing-route and
cleanup facts. It does not print the review text or token.

A successful review requires matching provider receipts, the existing semantic
proof checks, and destruction of both Sandboxes. The receipt records only
allowlisted observations. Quota facts are scoped to the same live client
session because the pinned client does not emit a new quota event for every
repair turn. Each new review direction starts a fresh client session.

## Failures and retry

`auth_failure` means enrollment or provider authentication failed. Replace or
repair the setup token before an operator stage retry.

`plan_limit` stops the attempt. No automatic workflow retry or paid-provider
fallback is allowed. A trusted reset time blocks a stage retry until that time.
If the provider supplies no reset time, the operator must choose when to retry.

`review_failure` includes missing model, effort or quota evidence, an invalid
result, a denied tool call, an interrupted client and a cleanup failure. Failed
reviews do not count as approvals. Their partial results stay out of the portal.
Use the existing stage retry control after fixing the cause. Do not reset an
invocation claim or replay a provider call within the same attempt.

## Roll back

Set the bundled default back to `simple-traceability` and deploy the backend.
Its registry update restores the default route for new runs. Keep the prior
OpenRouter model setting valid. Existing Claude runs stay frozen to Claude;
rollback does not rewrite active runs or human gates. A selected label can also
choose the prior definition when that project selector is enabled.

Build and deploy the DEOS portal separately with its canonical commands. Do not
build or deploy BettaView for this change.
