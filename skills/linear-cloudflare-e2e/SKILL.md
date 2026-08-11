---
name: linear-cloudflare-e2e
description: Verify a genuine Linear Issue webhook reaches a deployed Cloudflare Worker, with durable D1 evidence and visual/browser proof. Use for live integration verification, webhook setup, or demo-first Cloudflare validation; do not treat direct signed POSTs as provider-originated proof.
---

# Linear → Cloudflare E2E

Use this workflow when the requested proof must show that Linear itself emitted
an Issue webhook and the deployed Worker handled it.

## Required sequence

1. Confirm the deployed endpoint and the target Linear project.
2. Inspect Linear Settings → API → Webhooks in Codex Browser. Create or verify
   an enabled Issue webhook pointing at the Worker. Capture a screenshot, but
   never expose the signing secret.
3. Store the Linear signing secret in Cloudflare with Wrangler. Load the API
   token from the ignored `.env` as `CLOUDFLARE_API_TOKEN`; do not print either
   secret.
4. Deploy the current Worker. Confirm the deployed version through Wrangler or
   the Cloudflare API.
5. Use Linear MCP to create or locate a disposable issue in the test project,
   then transition it through the real target state. Use the provider's actual
   state name, such as `In Progress`.
6. Query remote D1 read-only for a delivery received immediately after the
   transition. Require `classification = relevant` and a fresh delivery ID.
7. Capture the issue's resulting state and webhook configuration with Codex
   Browser. Use Showboat to record the D1 query and remote response.

## Acceptance evidence

A genuine pass requires all of these to align:

- Linear shows an enabled webhook for the Worker URL.
- Linear MCP records the issue transition.
- D1 records a new delivery after that transition.
- The delivery is `relevant`, not merely `irrelevant` or `duplicate`.
- The Worker responds with HTTP `200` to Linear.
- The evidence identifies the provider event and does not rely only on a local
  HMAC script.

## Diagnosis

- `irrelevant`: compare the payload's actual `data.project.id` and
  `data.state.name` with Wrangler vars; do not assume a generic state label.
- `400`: inspect raw-body handling, millisecond timestamp parsing, and the
  Linear secret.
- Linear delivery failures: check the Worker response code; accepted Linear
  webhooks must return `200`.
- No D1 row: verify the webhook scope includes the target team and that the
  Cloudflare token has D1 read access.
- A successful direct curl only proves ingress behavior, not Linear emission.

## Secret and artifact rules

Keep secrets in ignored local environment files or Wrangler secret storage.
Showboat commands may read a secret from the environment, but their recorded
output must never contain it. Screenshots must redact signing secrets and API
tokens.
