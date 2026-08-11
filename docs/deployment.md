# Cloudflare deployment

The first slice uses Cloudflare's native Wrangler tooling rather than Terraform.
The deployable unit is a Python Worker with D1 and Queue bindings, so keeping
the binding configuration beside the Worker makes local review and deployment
behavior match. Terraform can be introduced later for shared accounts,
multiple environments, DNS, and policy-managed infrastructure.

## One-time resource setup

Install Node.js, `uv`, Wrangler, and the Python Worker tooling. Then authenticate
with Cloudflare and create the resources:

```sh
npx wrangler login
npx wrangler d1 create deos-sample-project
npx wrangler queues create deos-sample-project-events
npx wrangler r2 bucket create deos-sample-project-artifacts
```

The non-secret resource IDs are recorded in `wrangler.jsonc`; the webhook
secret is intentionally not committed to this repository. R2 is bound as
`env.ARTIFACTS` for provenance artifacts.

## Deploy

Set the webhook secret in the environment, then run:

```sh
export LINEAR_WEBHOOK_SECRET="..."
./scripts/deploy-cloudflare.sh
```

The script applies the D1 migration, uploads the secret through Wrangler, and
deploys the Python Worker through `pywrangler`. It never writes the secret to a
tracked file.

The deployed ingress endpoint is
`https://deos-sample-project.skundu.workers.dev`.

## Linear test project

The test project is `deos-sample-project` with ID
`99426d9b-cda7-4db4-9136-692a95a0b090`. Its enabled Linear Issue webhook points
at the deployed Worker URL and uses the Worker secret. Move an issue in that
project to `In Progress` to trigger it. Linear signs the raw request
body in `Linear-Signature` and sends the millisecond timestamp in
`Linear-Timestamp`; the Worker verifies both and uses `Linear-Delivery` as the
idempotency key. The Worker records the delivery in D1 and publishes the
translated application event to the Queue.

## Verification evidence

On 2026-08-11, a signed Linear-compatible transition payload was sent to the
deployed endpoint. The first request returned `200 accepted`; the identical
delivery returned `200 duplicate`; and remote D1 contained the delivery with
classification `relevant`. The Queue is provisioned with the Worker as its
producer. The `deos-sample-project-artifacts` R2 bucket was created and accepted
an uploaded proof object after deployment; it is bound as `env.ARTIFACTS` for
provenance artifacts.

After webhook registration, Linear MCP transitioned `SAC-73` to `In Progress`.
Remote D1 recorded the resulting Linear delivery at `2026-08-11T16:08:23Z`
with classification `relevant`.
