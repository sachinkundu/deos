# Agent guidance

## Demo-first delivery

Before implementing an integration, inspect the provider's primary contract
and identify whether a real sandbox/test resource can trigger it. Do not infer
the wire format, signature construction, timestamp units, or response contract
from a fake payload. Do not treat fakes or unit tests as evidence that the
provider can reach the deployed system.

For integrations, a passing test suite is not completion evidence. Separate
these claims explicitly:

- **Synthetic ingress proof:** a locally generated, correctly signed request
  sent directly to the Worker.
- **Provider-originated proof:** the real provider emits an event, the Worker
  receives it, and the durable store records the expected classification.
- **Visual proof:** Codex Browser screenshots of the provider configuration and
  the triggering issue/resource state.

Do not describe synthetic ingress as end-to-end provider verification.

## Tool selection

- Use Linear MCP for creating and transitioning test issues.
- Use Codex Browser for Linear webhook configuration, authenticated UI state,
  and screenshots.
- Use Wrangler or the Cloudflare API—not the browser—for Worker deployment,
  secrets, D1, Queues, and R2. Prefer `CLOUDFLARE_API_TOKEN` loaded from the ignored local
  `.env`; never print or commit it.
- Use Showboat to capture executable commands and their real remote output.
- Use the D1 query API as read-only evidence of the delivery record.

## Linear webhook invariants

- Verify the raw body with HMAC-SHA256 using `Linear-Signature`.
- Treat `Linear-Timestamp` as milliseconds and use `Linear-Delivery` as the
  idempotency key.
- Return HTTP `200` for accepted, ignored, and duplicate deliveries. Linear
  treats other response codes as failed deliveries and may retry.
- Configure the filter using actual Linear state names. This workspace uses
  `In Progress`; `Started` is not the displayed status name.

For the reusable procedure, read
[`skills/linear-cloudflare-e2e/SKILL.md`](skills/linear-cloudflare-e2e/SKILL.md).
