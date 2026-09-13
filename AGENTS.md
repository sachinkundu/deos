# Agent guidance

## Pass context through files

- Always write agent prompts, review context, source bundles, and other context
  payloads to files before handing them to a runner. Pass file paths on the
  command line, never the context itself, including base64-encoded context.
- Do not use environment variables or shell interpolation to carry context.
  If a provider client requires a stream or API body, read the saved file and
  send its contents through that interface.
- Use a separate request file for each concurrent call. Finish writing it before
  launching the reader, and preserve the full context without truncation.

## Preserve original errors

- Never swallow errors or replace them with generic messages that discard the
  original cause. No empty catches, silent fallbacks, or success-shaped results
  after a failure.
- Preserve the original error message, stack, cause chain, and relevant operation
  context in durable diagnostics before marking a workflow failed or cleaning up
  its runtime. Redact secrets without erasing the evidence needed to diagnose it.
- A safe public error code may accompany the original error; it must never be
  the only evidence retained. When wrapping an error, retain its original cause.
- Handle only errors the code can actually recover from. Propagate unexpected
  failures. Cleanup or diagnostic-write failures must not mask the primary error.

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

- Use Linear MCP by default for creating and transitioning test issues. Use
  Codex Browser only when a Linear login/configuration screen is required or
  when a screenshot is needed for visual proof.
- Use Wrangler or the Cloudflare API—not the browser—for Worker deployment,
  secrets, D1, Queues, and R2. Prefer `CLOUDFLARE_API_TOKEN` loaded from the ignored local
  `.env`; never print or commit it.
- Use Showboat to capture executable commands and their real remote output.
- Use the D1 query API as read-only evidence of the delivery record.
- For every implementation PR, attach the strongest visual proof available:
  sanitized screenshots of provider configuration and resulting state. Link or
  embed them in the PR body/comment alongside Showboat/D1 evidence.

## Linear webhook invariants

- Verify the raw body with HMAC-SHA256 using `Linear-Signature`.
- Treat `Linear-Timestamp` as milliseconds and use `Linear-Delivery` as the
  idempotency key.
- Return HTTP `200` for accepted, ignored, and duplicate deliveries. Linear
  treats other response codes as failed deliveries and may retry.
- Configure the filter using actual Linear state names. This workspace uses
  `In Progress`; `Started` is not the displayed status name.

For the maintained provider-proof procedure, evidence hierarchy, and PR
packaging guidance, read
[`docs/linear-cloudflare-e2e-lessons.md`](docs/linear-cloudflare-e2e-lessons.md).

## Production BettaView and portal

- The live `bettaview.voxdez.com` app is maintained in this repository at
  `portal/bettaview/`. Start all live BettaView UI and API work there.
- `/Users/sachin/code/bettaview` is the historical standalone experiment.
  Building it or copying its `dist` does not deploy the live site. Do not use it
  for production changes or deployment.
- Install BettaView dependencies with `npm ci --prefix portal/bettaview`.
  Build from the DEOS root with `npm run bettaview:build`; deploy with
  `npx wrangler deploy --config portal/bettaview/wrangler.jsonc`.
- The separate DEOS workflow portal uses `npm run portal:build` and
  `npx wrangler deploy --config portal/wrangler.jsonc`.
- Read back the deployed version at 100% traffic and verify the live browser.
  A local build or upload alone does not prove activation.
- The hash-pinned workflow trace runner is separate from the BettaView web app.
