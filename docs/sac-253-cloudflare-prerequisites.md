# SAC-253 Cloudflare setup before the live test

These account settings are owned by the Cloudflare operator. Keep the shared
test grant switch off until the readbacks below pass. Do not send service token
secrets in chat, an issue, or a pull request.

## Status page login: complete

On 28 September 2026, an authenticated Brave visit to
`https://deos-test.voxdez.com/` stayed on that hostname and showed the shared
test status page. No further status-page Access change is needed.

## Protect lease app origins separately

1. In **Zero Trust → Access controls → Service credentials → Service Tokens**,
   create a dedicated token named **DEOS shared test browser**. Put its one-time
   Client Secret directly into the `deos-queue-consumer-ts` Worker secret
   `TEST_APP_SERVICE_CLIENT_SECRET`. Do not send it in chat or a pull request.
2. In **Zero Trust → Access controls → Applications**, create a self-hosted application named **DEOS shared test apps**. Set its public hostname to `*.apps.deos-test.voxdez.com` and leave the path empty. This wildcard covers one lease-specific subdomain level; it does not cover the status host.
3. Add a **Service Auth** policy that includes only the new service token. Add a separate owner-only **Allow** policy for an operator's browser visit. Do not add this wildcard to the existing Workflow Portal or version-check application.
4. Tell Codex when the app, policies, token, and Worker secret are saved. Codex
   will read the non-secret AUD tag, policy ID, and Client ID, set the trusted
   Worker configuration, and create `TEST_MARKER_KEY_V1`. The browser service
   holds the token; its secret must never enter the test app, agent Sandbox,
   page, D1, or PR.
5. Codex will test the first lease app's `/api/version` route with the dedicated
   service identity and check a browser visit. The trusted app edge will also
   check its own lease-bound session on every app request.

Codex will record the application ID, policy ID, AUD tag, allowed hostname,
service token name and Client ID, status-page visit, and lease-app admission
result. The Client Secret stays out of that record. Leave
`SHARED_TEST_GRANTS_ENABLED=false` until the remaining proof gates are ready.

## Make the candidate build job available

GitHub starts `repository_dispatch` workflows from the default branch. Review
and merge [bootstrap PR #153](https://github.com/sachinkundu/deos/pull/153),
which adds `.github/workflows/shared-test-candidate-build.yml` to `main`,
before the first live lease. Its checks passed on 28 September 2026. The
existing GitHub App has Contents write permission for the dispatch. The build
job checks out the saved candidate commit without storing GitHub credentials.
A separate staging job receives the
existing `PORTAL_STAGING_CLOUDFLARE_API_TOKEN` secret, verifies the bundle, and
uploads it to private R2. On 27 September 2026, GitHub showed that this secret
exists in `staging`, that the environment permits `main`, and that it has no
reviewer or wait-timer rule. The first dispatch still needs a real readback.

Cloudflare documents the [eager redirect cookie](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/), [wildcard hostname matching](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/app-paths/), and [service token setup](https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/).
