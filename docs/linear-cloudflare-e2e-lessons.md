# Linear → Cloudflare E2E lessons

This document records what was built and what the live deployment taught us.
It is intentionally focused on evidence and repeatable operating practice.

## The main process failures

The most important lesson is that implementation started before the external
contracts and live path were verified:

1. The Linear webhook contract was not checked first. That led to incorrect
   assumptions about the signature input, timestamp units, payload shape, and
   required response code.
2. Fakes and deterministic unit tests were implemented before checking whether
   an actual Linear webhook could be registered and exercised. They validated
   application logic but created false confidence about integration behavior.
3. Browser tooling was initially used for Cloudflare operations even though
   Wrangler was the correct authenticated CLI for deployment, secrets, D1,
   Queues, and R2.

The prevention rule is: verify the provider contract, prove the real external
path is available, then implement the smallest slice and use fakes only for
isolated logic—not as a substitute for live integration proof.

## What was delivered

- A Python Cloudflare Worker receives Linear Issue webhooks.
- The Worker reads the raw request body, validates the Linear HMAC signature and
  millisecond timestamp, and uses `Linear-Delivery` for deduplication.
- Relevant events are classified using project ID and transition name,
  recorded in D1, and published to a Queue.
- Wrangler configuration provisions the Worker, D1, Queue, and R2 bindings.
- A Linear test project, `deos-sample-project`, was created and an enabled Issue
  webhook points to the deployed Worker.
- A Showboat artifact records both synthetic ingress evidence and the later
  genuine Linear-originated evidence.

## Final live proof

The test issue was `SAC-73 Verify deos webhook delivery`.

1. Linear MCP moved it from Backlog to `In Progress`.
2. Linear emitted an Issue webhook to the public Worker URL.
3. The first implementation recorded the deliveries as `irrelevant` because
   the Worker expected `Started`, while Linear's real status name is
   `In Progress`.
4. The Worker filter was changed to accept `In Progress,Started` and redeployed.
5. The issue was transitioned again.
6. Remote D1 recorded delivery
   `e76fc6cd-b193-4ef0-b956-5d982e993104` at
   `2026-08-11T16:08:23Z` with classification `relevant`.

This is provider-originated proof. Earlier Showboat runs that returned
`accepted` and `duplicate` were valid ingress demonstrations, but they used a
locally generated signed request and therefore were not proof that Linear had
emitted the webhook.

## Important lessons

### Provider contracts must be verified from primary documentation

Linear signs the raw body with HMAC-SHA256. The timestamp is milliseconds, and
the delivery header is the stable idempotency key. The Worker initially used a
timestamp-prefixed signing payload and seconds, which was wrong. The correct
contract is documented in [Linear webhooks](https://linear.app/developers/webhooks).

Linear also requires the webhook consumer to return HTTP `200`. Returning
`202` looked reasonable for asynchronous work but is treated as a failed
delivery and can cause retries. Accepted, ignored, and duplicate paths now all
return `200`.

### Provider payloads are not application events

Linear's payload puts the issue under `data` and identifies the webhook in
`webhookId`/`Linear-Delivery`. The ACL must translate provider fields into the
application event model. Do not assume top-level issue fields or a locally
invented delivery ID.

### Environment labels are not provider state names

The design called the transition “Started”; Linear displays the team status as
“In Progress”. A live delivery classified as `irrelevant` exposed this mismatch.
Use the actual provider value in deployment configuration, or deliberately
support an explicit compatibility set.

### Authentication has two independent surfaces

- Linear webhook creation and issue transitions require an authenticated Linear
  workspace session. Codex Browser is the appropriate visual tool for webhook
  settings and screenshots; Linear MCP is the appropriate semantic tool for
  issue creation and transitions.
- Cloudflare operations belong in Wrangler or the Cloudflare API. OAuth login
  may open a browser, but a token in ignored `.env` can be mapped to
  `CLOUDFLARE_API_TOKEN` for non-interactive commands. Token validity alone is
  not enough: verify D1 access with a harmless read-only query.

### Evidence must be layered

Use the smallest evidence that proves each claim:

- Browser screenshot: webhook enabled and issue in the target state.
- Showboat command/output: remote D1 row and deployment/resource lookup.
- Provider-originated event: issue transition immediately before the new D1
  row.

Tests remain useful for deterministic behavior, but they are not deployment or
provider proof.

## Repeatable runbook

1. Confirm `.env` is ignored and contains a token with Workers, Secrets, D1,
   Queues, and R2 permissions. Never print it.
2. Confirm `wrangler.jsonc` contains the real non-secret resource bindings and
   the actual Linear status names.
3. Deploy with Wrangler and inspect the active version.
4. In Codex Browser, verify the Linear webhook URL, enabled state, Issue event,
   and team scope. Redact the secret in any screenshot.
5. Put the webhook's signing secret into the Worker using Wrangler.
6. Create/transition the test issue through Linear MCP.
7. Query remote D1 for a fresh `relevant` row and capture it with Showboat.
8. Only then call the run provider-originated end-to-end proof.

## What we intentionally did not automate

No Git hook was added. A hook cannot reliably create Linear events or validate
Cloudflare state without live credentials, and it would encourage treating
local checks as integration proof. The explicit skill and runbook are safer and
make the external side effects visible.
