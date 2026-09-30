# SAC-253 Cloudflare setup before the live test

These account settings are owned by the Cloudflare operator. Keep the shared
test grant switch off until the readbacks below pass. Do not send service token
secrets in chat, an issue, or a pull request.

## Automated test reviewer: no new settings needed

On 29 September 2026, the deployed coordinator successfully rechecked the
existing `IMPLEMENTATION_TEST_GITHUB_TOKEN` against GitHub and the frozen
`github-linear-review-v1` test profile. The implementation uses that existing
reviewer for the automated lease app. It keeps the credential in the trusted
coordinator and limits requests to the disposable fixture. This removes the
callback and client-secret setup from the automated test prerequisites.

The candidate backend, review service, and Workflow still need live proof.
A successful identity check alone is not a completed review test.

An optional interactive OAuth path has a fixed callback at
`https://deos-queue-consumer-ts.skundu.workers.dev/shared-test/github/callback`.
Enabling that separate path would require the operator to register the callback
and provide the GitHub App secret to the coordinator. No such provider setting
change is needed for the current automated test.

## Status page login: complete

On 28 September 2026, an authenticated Brave visit to
`https://deos-test.voxdez.com/` stayed on that hostname and showed the shared
test status page. No further status-page Access change is needed.

## Lease app Access setup: admission verified

On 28 September 2026, Cloudflare showed the separate **DEOS shared test apps**
application on `*.apps.deos-test.voxdez.com` with no path. Its **Shared Test
Browser** Service Auth rule includes only the **DEOS shared test browser** token.
The token is enabled and attached to this application. The owner email Allow
rule is also attached. A broader **Cloudflare account members** Allow rule is
attached by the operator's choice; it does not grant the service token any
additional scope. The `deos-queue-consumer-ts` Worker lists both
`TEST_APP_SERVICE_CLIENT_SECRET` and `TEST_MARKER_KEY_V1` as secrets. Cloudflare
previously showed the token as **Not Seen Yet**. On 29 September, the current
service identity passed real lease app requests, and the trusted browser opened
the exact candidate app, connected Settings, and composed review drafts. The
credential stays in the coordinator. No further Access setting change is needed.
The [runtime evidence](evidence/sac-253/sac-182-runtime-recovery.md) separates
these successful app visits from the review scenarios that remain unverified.

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
   verifies the non-secret AUD tag, policy ID, and Client ID. The operator
   saves configuration and `TEST_MARKER_KEY_V1`; Codex does not create or rotate
   credentials or change account permissions. The browser service
   holds the token; its secret must never enter the test app, agent Sandbox,
   page, D1, or PR.
5. Codex will test the first lease app's `/api/version` route with the dedicated
   service identity and check a browser visit. The trusted app edge will also
   check its own lease-bound session on every app request.

Codex will record the application ID, policy ID, AUD tag, allowed hostname,
service token name and Client ID, status-page visit, and lease-app admission
result. The Client Secret stays out of that record. Leave
`SHARED_TEST_GRANTS_ENABLED=false` until the remaining proof gates are ready.

## Candidate build upload: existing token, corrected API

The build and upload run in separate jobs. Only the trusted upload job receives
`SHARED_TEST_R2_UPLOAD_TOKEN` from GitHub's `staging` environment. Candidate code
never receives it.

A rerun on 29 September still returned HTTP 403, Cloudflare code 10000, through
Wrangler's REST object endpoint. The previous instructions incorrectly said a
bucket Object Read & Write token could use that endpoint. Cloudflare documents
that bucket object tokens use the **S3 API**. The uploader now uses that API,
with create-only uploads and exact byte readback. It reads the existing token's
ID and derives its documented S3 representation in memory. It does not create,
rotate, or broaden the token. The GitHub run still needs to prove this fix with
its own saved secret. The latest run built both services and compiled modules,
then the existing staging branch rule rejected the uploader before it received
a runner or secret. Run the upload from the allowed branch after the final
merge; changing that protection rule is not needed.

No operator permission change is requested for this repair. For a fresh setup,
the operator supplies one token with Object Read & Write access to
`deos-sample-project-artifacts`, saved as `SHARED_TEST_R2_UPLOAD_TOKEN`. The
existing portal staging deploy credential is separate.

Sources: [R2 authentication and token permissions](https://developers.cloudflare.com/r2/api/tokens/)
and [account token verification](https://developers.cloudflare.com/api/resources/accounts/subresources/tokens/methods/verify/).
The [build and upload evidence](evidence/sac-253/candidate-build-upload.md)
retains the original failure and the separate local readback. A local readback
is not proof that the GitHub job's token works.

## Staging base: ready for a lease

On 28 September 2026, both staging Workers were built from merged `main`
commit `f8275c1e21a420febeed40139e16fd90605f7b80`. Their exact build
bundles were uploaded to private R2 and downloaded for hash comparison. The
BettaView staging Worker and its custom domain now exist. The portal staging
Worker was updated because its older deployment did not return a complete
version record. The coordinator read both version responses twice through its
private service bindings and saved one stable D1 manifest. At that readback the site was
free, with no active attempts and `SHARED_TEST_GRANTS_ENABLED=false`.

The [live readback](evidence/sac-253/staging-live.md) includes the two source
commits, build digests, deployment versions, and D1 pointer. An authenticated
Brave visit to `deos-test.voxdez.com` now says the site is ready for the next
checked task. Later leases proved app Access, candidate deployment, browser admission,
sanitized screenshots, and retained-failure cleanup. A successful full review
flow, success closure, and lasting report remain separate proof gates.

Cloudflare documents the [eager redirect cookie](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/), [wildcard hostname matching](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/app-paths/), and [service token setup](https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/).

## Test identities must be agreed before the demo

Working Cloudflare Access does not supply a second GitHub or Linear user. The
current test profile has one checked reviewer. It can exercise normal reviews,
retries, account rotation, and forged-page rejection with that existing account.

The inherited SAC-182 plan also asks for a different Linear user on reconnect
and a different checked GitHub user against a frozen account link. Those cases
need an owner decision: provide an approved second test identity, or accept
automated rejection coverage for those two cases. Same-account checks do not
count as different-person proof. No account, token, or permission is changed
automatically, and an unanswered request does not waive a test.

Future design handoffs must list the needed test roles, the available fixture
identities, and any owner setup before freezing the demo plan. This avoids
discovering a missing account only after implementation and deployment.
