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

## Staging deployment and browser verification

- Treat an authorized staging deployment and its live browser check as part of
  implementation completion. A later production release follows its own gates;
  do not block staging completion on production-only checks. Keep the normal
  release branch policy intact when the user authorizes a manual staging deploy.
- Staging shares backend services and D1 with production. Before a shared Worker
  deploy, read its active version and identify its source revision. Preserve
  newer deployed fixes, even when they have not reached the implementation
  branch. Recheck the active version immediately before deployment. If it has
  changed, reconcile against the new baseline before proceeding.
- For an additive Worker entrypoint change, preserve existing bindings and vars.
  Avoid a container rollout when no container change is needed. Record the
  deployed source revision, Worker version, and container rollout choice.
- Verify the active version at 100% traffic, then exercise the feature in the
  requested browser. Recheck the backend after browser testing: another deploy
  can remove an entrypoint while leaving its D1 data intact.
- A deployment command can fail after activation. Preserve its original error
  and exit status, inspect provider deployment state, and test the live hostname
  before deciding whether a retry is needed. Do not report a clean command
  success or blindly redeploy after a route-read permission error.
- Use an existing authenticated session in the requested browser, including
  Brave when requested. For portal history, real completed and ongoing issues
  can prove search, repeat ordering, reload persistence, and saved navigation
  without creating issues or changing workflow states. Confirm those states
  remain unchanged in D1. State separately which limits were tested locally.
- Check Access policy per endpoint. The portal's `/api/version` endpoint uses a
  separate service-token policy; a reviewer session alone can return 403 there.
  Keep service credentials and reviewer assertions out of saved evidence.

See [SAC-161 live evidence](docs/evidence/sac-161/README.md) for the deployment
collision, recovery, browser checks, and retained command error behind this guidance.
