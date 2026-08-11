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
```

Copy `wrangler.toml.example` to a private local config if desired. The D1
database ID returned by the create command is passed as
`DEOS_D1_DATABASE_ID`; it is intentionally not committed to this repository.

## Deploy

Set the account, database, and secret values in the environment, then run:

```sh
export CLOUDFLARE_ACCOUNT_ID="..."
export DEOS_D1_DATABASE_ID="..."
export LINEAR_WEBHOOK_SECRET="..."
./scripts/deploy-cloudflare.sh
```

The script applies the D1 migration, uploads the secret through Wrangler, and
deploys the Python Worker through `pywrangler`. It never writes the secret to a
tracked file.

## Linear test project

The test project is `deos-sample-project` with ID
`99426d9b-cda7-4db4-9136-692a95a0b090`. Configure the Linear webhook to point at
the deployed Worker URL, use the same signing secret, and send the configured
`Started` transition for an issue in that project. The Worker records the
delivery in D1 and publishes the translated application event to the Queue.
