# SAC-253 Cloudflare setup before the live test

These account settings are owned by the Cloudflare operator. Keep the shared
test grant switch off until the readbacks below pass. Do not send service token
secrets in chat, an issue, or a pull request.

## Make the status page login work

1. Open the [DEOS Workflow Portal Access application](https://dash.cloudflare.com/c68856288112af7698f5be52ea94b96e/one/access-controls/apps/self-hosted/36789d6a-e316-402b-a14a-a4501c53fb81/edit?tab=settings).
2. Under **Additional settings → Cookie settings**, turn **Eager redirect cookie** off and save. This application currently covers both `deos-test.voxdez.com` and the DNS-less `bettaview-staging.voxdez.com`. Eager redirect is on and sends a login through the latter hostname.
3. Sign in at `https://deos-test.voxdez.com/` in a fresh browser session. The page should show the shared test status, and the final URL should stay on `deos-test.voxdez.com`.

The existing application already covers the full status hostname with the
owner-only Allow policy. Turning off eager redirect does not remove that policy.

## Protect lease app origins separately

1. In **Zero Trust → Access controls → Service credentials → Service Tokens**, create a dedicated token named **DEOS shared test browser**. Copy its Client Secret into the trusted coordinator's secret store when Cloudflare shows it; Cloudflare shows it only once. Keep its Client ID for readback.
2. In **Zero Trust → Access controls → Applications**, create a self-hosted application named **DEOS shared test apps**. Set its public hostname to `*.apps.deos-test.voxdez.com` and leave the path empty. This wildcard covers one lease-specific subdomain level; it does not cover the status host.
3. Add a **Service Auth** policy that includes only the new service token. Add a separate owner-only **Allow** policy for an operator's browser visit. Do not add this wildcard to the existing Workflow Portal or version-check application.
4. In the trusted `deos-queue-consumer-ts` Worker, set the new application's AUD tag as `TEST_APP_ACCESS_AUD`, the Service Auth policy ID as `TEST_APP_ACCESS_POLICY_ID`, the token's Client ID as `TEST_APP_SERVICE_CLIENT_ID`, and its Client Secret as `TEST_APP_SERVICE_CLIENT_SECRET`. The trusted browser service also needs the token to reach a lease app. The secret must never enter the test app, agent Sandbox, page, D1, or PR.
5. After the first lease app is deployed, test its `/api/version` route with the dedicated service identity and test a browser visit. The trusted app edge will also check its own lease-bound session on every app request.

Record the application ID, policy ID, AUD tag, allowed hostname, service token
name and Client ID, status-page visit, and lease-app admission result. Keep the
Client Secret out of that record. Leave `SHARED_TEST_GRANTS_ENABLED=false` until
the rest of the implementation and proof gates are ready.

Cloudflare documents the [eager redirect cookie](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/), [wildcard hostname matching](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/app-paths/), and [service token setup](https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/).
