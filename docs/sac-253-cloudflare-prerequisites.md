# SAC-253 Cloudflare setup before the live test

These account settings are owned by the Cloudflare operator. Keep the shared
test grant switch off until the readbacks below pass. Do not send service token
secrets in chat, an issue, or a pull request.

## GitHub sign-in for lease apps: code path pending

The lease BettaView address changes on each run. The trusted coordinator will
use one fixed callback:
`https://deos-queue-consumer-ts.skundu.workers.dev/shared-test/github/callback`.
It will map a one-use sign-in state to the active lease and return the browser
to that lease. The candidate's own review backend will send its GitHub network
calls through a trusted, lease-scoped transport without receiving a GitHub
credential. No Cloudflare permission change or new hostname is planned.

After the callback and proxy code is ready, the operator has two manual steps:

1. In the GitHub App whose Client ID is `Iv23likxukpheraNrZlx`, add that exact
   callback URL and keep wildcard matching off. Preserve the current callback.
2. Put that app's existing Client Secret into the trusted
   `deos-queue-consumer-ts` Worker secret `SHARED_TEST_GITHUB_CLIENT_SECRET`.
   Do not put it on a lease Worker or send its value in chat.

Do not perform these steps yet. A saved callback and secret alone cannot prove
the app works; the coordinator must first have the route and test it with a
real lease sign-in and scoped GitHub request.

## Status page login: complete

On 28 September 2026, an authenticated Brave visit to
`https://deos-test.voxdez.com/` stayed on that hostname and showed the shared
test status page. No further status-page Access change is needed.

## Lease app Access setup: saved, admission proof pending

On 28 September 2026, Cloudflare showed the separate **DEOS shared test apps**
application on `*.apps.deos-test.voxdez.com` with no path. Its **Shared Test
Browser** Service Auth rule includes only the **DEOS shared test browser** token.
The token is enabled and attached to this application. The owner email Allow
rule is also attached. A broader **Cloudflare account members** Allow rule is
attached by the operator's choice; it does not grant the service token any
additional scope. The `deos-queue-consumer-ts` Worker lists both
`TEST_APP_SERVICE_CLIENT_SECRET` and `TEST_MARKER_KEY_V1` as secrets. Cloudflare
still shows the token as **Not Seen Yet**. The first lease app must prove a real
request before browser admission is complete.

The non-secret Access audience, Service Auth policy ID, and token Client ID are
in `wrangler.queue-consumer-ts.jsonc`. The secret values are not in this file.

## Original operator setup steps

1. In **Zero Trust → Access controls → Service credentials → Service Tokens**,
   create a dedicated token named **DEOS shared test browser**. Put its one-time
   Client Secret directly into the `deos-queue-consumer-ts` Worker secret
   `TEST_APP_SERVICE_CLIENT_SECRET`. Do not send it in chat or a pull request.
2. In **Zero Trust → Access controls → Applications**, create a self-hosted application named **DEOS shared test apps**. Set its public hostname to `*.apps.deos-test.voxdez.com` and leave the path empty. This wildcard covers one lease-specific subdomain level; it does not cover the status host.
3. Add a **Service Auth** policy that includes only the new service token. Add a separate owner-only **Allow** policy for an operator's browser visit. Do not add this wildcard to the existing Workflow Portal or version-check application.
4. Tell Codex when the app, policies, token, and Worker secret are saved. Codex
   reads the non-secret AUD tag, policy ID, and Client ID, sets the trusted
   Worker configuration, and creates `TEST_MARKER_KEY_V1`. The browser service
   holds the token; its secret must never enter the test app, agent Sandbox,
   page, D1, or PR.
5. Codex will test the first lease app's `/api/version` route with the dedicated
   service identity and check a browser visit. The trusted app edge will also
   check its own lease-bound session on every app request.

Codex will record the application ID, policy ID, AUD tag, allowed hostname,
service token name and Client ID, status-page visit, and lease-app admission
result. The Client Secret stays out of that record. Leave
`SHARED_TEST_GRANTS_ENABLED=false` until the remaining proof gates are ready.

## Candidate build job: build proven, GitHub upload credential blocked

GitHub starts `repository_dispatch` workflows from the default branch.
[Bootstrap PR #153](https://github.com/sachinkundu/deos/pull/153) merged on
28 September 2026 and added `.github/workflows/shared-test-candidate-build.yml`
to `main`. Its checks passed. The
existing GitHub App has Contents write permission for the dispatch. The build
job checks out the saved candidate commit without storing GitHub credentials.
A separate staging job verifies the bundle and uploads it to private R2. The
merged workflow initially reused `PORTAL_STAGING_CLOUDFLARE_API_TOKEN` for this
upload. On 27 September 2026, GitHub showed that this secret exists in
`staging`, that the environment permits `main`, and that it has no reviewer or
wait-timer rule. The first dispatch on 28 September 2026 built both
candidate services successfully, but both upload jobs received Cloudflare HTTP
403, code 10000, when writing objects to `deos-sample-project-artifacts`.
The same checked GitHub artifacts uploaded and read back successfully with the
local operator credential. This isolates the remaining job failure to the
GitHub environment secret's R2 permission. That first dispatch built the
SAC-253 implementation PR commit. Its bundles are not the SAC-182 canary
candidate. A separate upload credential is needed for future unattended uploads.

The implementation workflow now uses a separate `SHARED_TEST_R2_UPLOAD_TOKEN`
secret. The portal staging deploy credential stays unchanged. Before relying on
automatic candidate uploads, the operator must create a Cloudflare API token
with **Workers R2 Storage Bucket Item Write** permission scoped to
`deos-sample-project-artifacts` and save its value as
`SHARED_TEST_R2_UPLOAD_TOKEN` in GitHub's `staging` environment. That permission
allows the job's object upload and readback through the Cloudflare REST API used
by Wrangler. Keep the value out of chat and pull requests. Once the
implementation workflow is on `main` and the secret exists, rerun a candidate
dispatch. Cloudflare's [R2 token permissions](https://developers.cloudflare.com/r2/api/tokens/)
distinguish this REST API permission from S3-only Object Read & Write tokens.
GitHub's environment secret name readback on 28 September showed the new
`SHARED_TEST_R2_UPLOAD_TOKEN` is not yet saved.

[The first dispatch and local readback](evidence/sac-253/candidate-build-upload.md)
record the exact result.
The same record now includes a separate passing build and private R2 readback
for the actual SAC-182 PR #137 candidate. Its first lease and demo remain open.

## Staging base: ready for a lease

On 28 September 2026, both staging Workers were built from merged `main`
commit `f8275c1e21a420febeed40139e16fd90605f7b80`. Their exact build
bundles were uploaded to private R2 and downloaded for hash comparison. The
BettaView staging Worker and its custom domain now exist. The portal staging
Worker was updated because its older deployment did not return a complete
version record. The coordinator read both version responses twice through its
private service bindings and saved one stable D1 manifest. The site remains
free, with no active attempts and `SHARED_TEST_GRANTS_ENABLED=false`.

The [live readback](evidence/sac-253/staging-live.md) includes the two source
commits, build digests, deployment versions, and D1 pointer. An authenticated
Brave visit to `deos-test.voxdez.com` now says the site is ready for the next
checked task. The first lease still must prove the separate app Access
identity, candidate deployment, browser session, public proof, and cleanup.

Cloudflare documents the [eager redirect cookie](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/), [wildcard hostname matching](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/app-paths/), and [service token setup](https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/).
