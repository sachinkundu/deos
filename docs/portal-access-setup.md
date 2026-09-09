# Portal Access setup in the dashboard

These steps let the owner configure Access without granting an automation
token permission to manage Access or other API tokens. Use the Cloudflare
account named **Skundu@hey.com's Account**.

## 1. Protect staging with the existing login

Open **Zero Trust > Access controls > Applications**. Edit the application
that protects `deos.voxdez.com`. Add a public hostname with:

| Field | Value |
| --- | --- |
| Subdomain | `deos-staging` |
| Domain | `voxdez.com` |
| Path | Leave empty |

Keep the existing production hostname, user policies, and login providers.
Save the application. Adding staging to the same application lets both hosts
use the audience already configured in the portal.

## 2. Create the deployment probe credential

Open **Zero Trust > Access controls > Service credentials > Service Tokens**.
Select **Create Service Token**. Name it **DEOS portal deployment probe** and
choose a one-year duration. Generate it and save its Client ID and Client
Secret in a password manager. Cloudflare displays the secret only once.

Open [GitHub deployment environments](https://github.com/sachinkundu/deos/settings/environments).
In each of **staging** and **production**, add these environment entries:

| GitHub name | Entry type | Cloudflare value |
| --- | --- | --- |
| `PORTAL_ACCESS_CLIENT_ID` | Variable | Client ID |
| `PORTAL_ACCESS_CLIENT_SECRET` | Secret | Client Secret |

Use the same pair in both environments. Enter the values directly in GitHub;
do not paste them into chat or commit them.

## 3. Permit the probe on the version paths

Return to **Access controls > Applications**. Create a new application of type
**Self-hosted and private**, named **DEOS portal version checks**. Add two
public hostnames:

| Subdomain | Domain | Path |
| --- | --- | --- |
| `deos` | `voxdez.com` | `api/version` |
| `deos-staging` | `voxdez.com` | `api/version` |

The dashboard already shows the leading slash before the Path field. Enter
`api/version` in the field. A blank path conflicts with the existing application
for the whole hostname.

Create a policy named **Allow deployment probe**. Set its action to
**Service Auth**. Add an **Include** rule with selector **Service Token** and
value **DEOS portal deployment probe**. Attach it to this application and save.
Keep the hostname paths exactly as above, without a wildcard.

This application grants the service token access to version metadata. The
existing application continues to protect the rest of each portal. The
service token does not grant Cloudflare administration or deployment rights.

## Deployment credentials

Both GitHub environments now contain their separate deployment credentials.
These credentials are distinct from the Access probe. For replacement tokens,
use Cloudflare's Account API tokens page. The token names are
**DEOS portal staging deploy** and **DEOS portal production deploy**.
Use these permissions:

| Scope | Permission | Access |
| --- | --- | --- |
| Account | Workers Scripts | Edit |
| Account | Workers R2 Storage | Read |
| Zone | Zone | Read |
| Zone | Workers Routes | Read |

Create **two separate permission policies** in each token:

1. Choose **Entire Account** within **Skundu@hey.com's Account**. Select only
   **Workers Scripts Write** and **Workers R2 Storage Read**.
2. Choose **Specified Domains**, then **voxdez.com**. Select **Zone Read** and
   **Workers Routes Read**.

Do not put the Worker or R2 permissions in the domain policy. The dashboard can
retain them as "Other selected permissions" after a scope change, but they do
not grant access to account-level Workers there. This caused the first staging
run to fail on its Worker service lookup with Cloudflare error 10000.
Neither production nor staging changed during that failed run.

For an existing token, edit its policies and save without rotating its value.
Its GitHub secret then needs no change. For a new token, save each value
directly as an environment secret in GitHub:

| GitHub environment | Secret name |
| --- | --- |
| staging | `PORTAL_STAGING_CLOUDFLARE_API_TOKEN` |
| production | `PORTAL_PRODUCTION_CLOUDFLARE_API_TOKEN` |

Workers Scripts Edit supports uploads and Custom Domain attachment. The locked
Wrangler version checks the existing R2 bucket when it first provisions the
staging binding, so it needs R2 read access. The D1 binding already has its
database ID and does not require provisioning. Zone read access supports zone
discovery. Workers Routes Read lets Wrangler check whether a route is already
assigned to another Worker before it attaches the Custom Domain. This check
also runs when there are no ordinary Worker routes to create. The second
staging attempt uploaded the Worker but stopped at this route check because
the token lacked that read permission. It did not attach the staging hostname.
Account Settings Read is not required: the configured `account_id`
lets Wrangler skip account discovery. The Worker account-settings endpoint also
accepts Workers Scripts Write, so it does not require a separate account-settings
grant. This permission set still needs a real deployment check.

No Access administration or API token management permission is needed for
deployment. Worker write access remains account-wide. The accepted scope
limitation and remaining release steps are documented in
[portal release](portal-release.md).

The shared `STAGE_RETRY_SECRET` was replaced with owner approval on 2026-09-09.
The backend, production portal, and staging placeholder now hold the same
replacement. A private copy is saved in the ignored local `.env`. No copy is
needed in GitHub. See the [rotation procedure](portal-release.md#shared-retry-secret).
Staging has received its first application upload from main. Hostname attachment
and the live checks remain pending.

## Inventory audit credential

The hourly sandbox inventory audit uses the repository secret
`CLOUDFLARE_API_TOKEN`. Replace its broad deployment token with an account token
named **DEOS inventory read-only**. Use an **Entire Account** policy with only
**Containers Read** in the same account. Do not add zone or Worker permissions.
Run the audit once to verify the replacement. The portal deployment tokens stay
in their separate GitHub environments.

## Provider instructions checked on 2026-09-09

- [Self-hosted Access applications](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/)
- [Service tokens](https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/)
- [Application paths and precedence](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/app-paths/)
- [GitHub Actions deployment credentials](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/)
- [Worker upload permissions](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/methods/update/)
- [Custom Domain permissions](https://developers.cloudflare.com/api/resources/workers/subresources/domains/methods/update/)
- [Workers route list permissions](https://developers.cloudflare.com/api/resources/workers/subresources/routes/methods/list/)
- [R2 bucket read permissions](https://developers.cloudflare.com/api/resources/r2/subresources/buckets/methods/get/)
- [Worker account-settings permissions](https://developers.cloudflare.com/api/resources/workers/subresources/account_settings/methods/get/)
