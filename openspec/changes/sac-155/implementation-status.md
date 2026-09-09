# Implementation status

Planning PR #91 and design PR #92 are merged. Implementation is isolated in
`codex/sac-155-implementation`. Repository implementation is present; provider configuration and live migration remain incomplete.

## Completed local slice

The fixed staging target shares production's D1, R2, and backend services.
The Worker supplies the site name to the page title and portal shell.
Safe `GET /api/version`, within the host Access perimeter, reports site, canonical host, branch, source
SHA, and Cloudflare version metadata. The fixed deploy entrypoint supplies the checked-out source SHA. The checked-in
placeholder is explicitly `unbuilt`.

All 68 portal tests, 16 release tests (including real local Git promotion and
retry), Python lint, portal type-checking, both canonical portal builds, staging
Wrangler dry-run, and strict OpenSpec validation pass.

## Credential decision

The design requires a staging-scoped Cloudflare token that cannot edit the
production Worker. Cloudflare's documented API token resource scopes are User,
Account, and Zone; Workers Scripts Write is an account permission. Two Workers
in this account cannot be isolated by simply creating separate tokens.

Sources checked on 2026-09-09:

- https://developers.cloudflare.com/fundamentals/api/how-to/create-via-api/
- https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/versions/methods/create/
- https://developers.cloudflare.com/workers/versions-and-deployments/
- https://developers.cloudflare.com/workers/runtime-apis/bindings/version-metadata/

Approved by the user on 2026-09-09: use separate protected GitHub environment secrets and the
fixed deployment preflight to prevent accidental cross-deployment, while
explicitly accepting that staging's token can technically edit account Workers.
Provider-enforced isolation would require a different design. The design now records this accepted limitation.

## Read-only provider snapshot

On 2026-09-09, production's active deployment was
`99c7a7f8-b46c-47f6-9302-eff15191f94e`, with version
`df20c143-b007-4da9-9b15-e54679d5a7ab` at 100 percent traffic.
Its deployment message does not identify a source SHA. Establishing the exact
source baseline remains open; do not initialize `release` from a guess.

The live bindings match the configuration:

- D1: `4e854f8a-018a-42c4-a325-c4b8805c06b2`.
- R2: `deos-sample-project-artifacts`.
- Services: `deos-queue-consumer-ts`, with `RouteAdmin` for `ROUTE_ADMIN`.

GitHub has no deployment environments. A repository-wide
`CLOUDFLARE_API_TOKEN` secret exists and the sandbox inventory audit uses it.
Do not remove that secret until the unrelated audit has suitable read access.
The existing CI workflow contains dry-run validation, not a production deploy.

No production/release branches, secrets, environments, Workers, routes, Access settings,
workflow states, or shared data were changed. Staging still needs Access
protection and the shared retry secret before live use. No provider-originated
or visual deployment proof has been claimed.
