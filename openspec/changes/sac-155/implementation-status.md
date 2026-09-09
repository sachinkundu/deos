# Implementation status

Planning PR #91, design PR #92, and implementation PR #93 are merged.
The live rollout remains incomplete. Follow-up evidence is being recorded in
`codex/sac-155-rollout`.

## Completed local slice

The fixed staging target shares production's D1, R2, and backend services.
The Worker supplies the site name to the page title and portal shell.
Safe `GET /api/version`, within the host Access perimeter, reports site, canonical host, branch, source
SHA, and Cloudflare version metadata. The fixed deploy entrypoint supplies the checked-out source SHA. The checked-in
placeholder is explicitly `unbuilt`.

All 69 portal tests, 16 release tests (including real local Git promotion and
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
Its deployment message does not identify a source SHA. We reconstructed the
source from main plus the four existing portal edits in the original checkout.
The rebuilt Worker, JavaScript, and CSS match the live bytes by SHA-256.
Commit `6018ea33d2bba472b717e6fb6a4a8554fef92207` preserves that baseline.
The remote `release` branch now points to it. This branch creation did not deploy
anything. The implementation branch includes the same baseline changes.

The live bindings match the configuration:

- D1: `4e854f8a-018a-42c4-a325-c4b8805c06b2`.
- R2: `deos-sample-project-artifacts`.
- Services: `deos-queue-consumer-ts`, with `RouteAdmin` for `ROUTE_ADMIN`.

GitHub now has staging and production environments. Both allow only the main
branch. Production requires approval by sachinkundu. Both environments now
have the probe Client ID as a variable and Client Secret as a secret. The
workflows read these entry types. Both environments now also contain their
separate deployment token secrets. These checks confirm secret names and
placement, not token values or successful authentication. A repository-wide
`CLOUDFLARE_API_TOKEN` secret exists and the sandbox inventory audit uses it.
Do not remove that secret until the unrelated audit has suitable read access.
The existing CI workflow contains dry-run validation, not a production deploy.

The baseline setup did not change Workers, routes, workflow state, or shared data.
The later secret rotation is recorded below. The owner added staging to the
existing Access application. Browser inspection confirmed deos.voxdez.com,
bettaview.voxdez.com, and deos-staging.voxdez.com under Allow Sachin only.
The owner also created DEOS portal version checks. Browser inspection confirms
deos.voxdez.com/api/version and deos-staging.voxdez.com/api/version, with the
Service Auth policy limited to the DEOS portal deployment probe service token.
This confirms configuration, not successful authentication from GitHub.
The owner completed Access setup and token creation in the dashboard after the agent's
credential received HTTP 403 for those operations. No broader agent API
permissions were granted. See docs/portal-access-setup.md.

## Shared retry secret rotation

The owner approved replacement on 2026-09-09. Cloudflare reported zero running
DEOS Workflows. The two durable records still marked active correspond to
instances that errored on August 27 and August 31; they were not resumed.
A new value was installed on the backend, production portal, and staging
placeholder. The ignored local `.env` retains a private copy with mode 0600.
No value was printed or placed in GitHub.

Production now serves version `a3e925cc-3b26-46d0-8fc5-b7602eb3f4d9` at 100 percent.
The backend serves `0331c8c9-98ba-44c6-8783-1edfb15a5b9e` at 100 percent.
All Worker module hashes, runtime settings, bindings, and backend container
configuration match the before-state. Only the secret and deployment metadata
changed. Production loaded normally after a browser reload.

Staging has version `09ac1352-a5d1-4f73-9383-7acc81fdea09` with only the shared
secret. It has no data bindings or public targets; workers.dev and preview URLs
are disabled. This is setup evidence, not a deployed staging application.
A direct backend authentication probe received HTTP 403 before an application
response could be verified. No retry or recovery was triggered. Successful
portal-to-backend retry authentication remains unverified.

## First staging run

The owner approved deployment and continued rollout. PR #93 merged with merge
commit `c02de5f3d3f0bb1825b5eec0e4dcbee9d8ea0840`, preserving the release baseline
in main's ancestry. The main push started GitHub run `34324212520`.

All 69 portal tests, type-checking, and both builds passed. Wrangler then failed
to read `/workers/services/deos-workflow-portal-staging` with Cloudflare error
10000. The token identity was valid. Browser inspection found Workers Scripts
Write and Workers R2 Storage Read attached to a Specified Domains policy for
voxdez.com. They need a separate Entire Account policy. The setup guide now
states the two policies explicitly.

Read-back confirms production and the staging placeholder kept their previous
deployments. No upload occurred. The owner was asked to correct both deployment
token policies without rotating their values, and to replace the repository
inventory token with Containers Read. The failed deployment will be retried
after those saved settings are confirmed.

The provider snapshot and exact baseline hashes are recorded in
docs/evidence/sac-155/rollout.md. This is baseline and configuration evidence.
Live staging, release, and later main-only deployment proof remain pending.
