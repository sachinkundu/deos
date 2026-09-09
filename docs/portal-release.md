# Portal staging and release

Production is `deos.voxdez.com`, Worker `deos-workflow-portal`. Staging is
`deos-staging.voxdez.com`, Worker `deos-workflow-portal-staging`. Both use the
same D1, R2, and backend services. Staging writes can affect production data.
BettaView and backend deployments are separate and are not managed here.

## Commands

From a clean checkout of a commit contained in remote `main`, run:

```sh
python scripts/deploy_portal_staging.py
```

The command accepts no arguments. It checks refs and fixed resources, installs
the locked dependencies, tests and builds both portal entries, and deploys only
staging. GitHub runs this same command on relevant pushes to `main`.

For production, start **Release portal production** from `main` in GitHub
Actions and enter the full SHA reviewed on staging. The serialized workflow
fast-forwards `release`, checks out that head, then builds and deploys it.
The selected commit must contain this implementation. Production cannot deploy
until `release` has been initialized at a verified source baseline.

Both commands require `CLOUDFLARE_API_TOKEN`, `PORTAL_ACCESS_CLIENT_ID`, and
`PORTAL_ACCESS_CLIENT_SECRET` in their environment. Never put values in command
arguments or committed files. A successful deploy requires Wrangler success,
one Cloudflare version at 100 percent, and matching host metadata. The command
does not retry or roll back after an unclear result. Inspect the observed
deployment first. A failed build leaves production unchanged, even if `release`
has moved. Retry that same SHA once the failure is understood.

For rollback, revert the unwanted changes in a new main commit, review it on
staging, then release it normally. Older SHAs are not fast-forward promotions.

## Required provider setup before cutover

The production baseline and GitHub environment protections are now in place.
See [rollout evidence](evidence/sac-155/rollout.md). The owner will configure
Cloudflare Access using the [dashboard steps](portal-access-setup.md), without
granting the agent Access administration or API token management permissions.

1. Establish the exact source of the currently active production bundle. The
   initial snapshot has no source SHA, so `main` must not be assumed equivalent.
   Initialize `release` at that verified commit without deploying it.
2. Configure the staging host in the existing Access application with the same
   user policy and audience. Provision the staging Worker and its shared
   `STAGE_RETRY_SECRET` through the existing secret-management process. Do not
   create new D1 or R2 stores.
3. Create an Access service token for deployment probes and a Service Auth
   policy for each host's `/api/version` path. Preserve the existing application
   and user policy on all other paths. The endpoint contains only site, host,
   branch, source SHA, and version ID. All pages and data APIs still require the
   existing verified user identity inside the Worker.
4. Create protected GitHub environments `staging` and `production`, restricted
   to workflows dispatched from `main`. Require a human reviewer for production.
   Store `PORTAL_STAGING_CLOUDFLARE_API_TOKEN` only in staging and
   `PORTAL_PRODUCTION_CLOUDFLARE_API_TOKEN` only in production. Store the probe's
   `PORTAL_ACCESS_CLIENT_ID` and `PORTAL_ACCESS_CLIENT_SECRET` in each environment.
5. Replace the repository-wide Cloudflare deployment token only after giving
   the existing sandbox inventory audit a suitable read-only token. Disable any
   external main-triggered production deploys. The existing repository CI only
   performs dry runs; it does not deploy production.
6. After merging the implementation, exercise staging and capture browser,
   shared-data, and provider version evidence. Then deliberately release a
   revision that preserves current production features. Confirm availability,
   labels, shared records, and one active version at 100 percent.
7. Prove a later main-only update changes staging without changing production.

Cloudflare tokens cannot enforce individual-Worker isolation in this account.
Separate environment secrets limit where credentials are provided. Fixed
preflight checks prevent accidental target selection. Neither prevents a
compromised account-scoped token from editing another Worker. This limitation
was explicitly accepted on 2026-09-09.

The initial rollout remains pending. Do not describe local tests or dry runs as
live deployment proof.

## Primary contracts

- [Cloudflare token resource scopes](https://developers.cloudflare.com/fundamentals/api/how-to/create-via-api/)
- [Worker versions and deployments](https://developers.cloudflare.com/workers/versions-and-deployments/)
- [Version metadata binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/version-metadata/)
- [Access service tokens](https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/)
- [GitHub workflow concurrency and queueing](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)
