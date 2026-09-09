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
In each of **staging** and **production**, add these environment secrets:

| GitHub secret name | Cloudflare value |
| --- | --- |
| `PORTAL_ACCESS_CLIENT_ID` | Client ID |
| `PORTAL_ACCESS_CLIENT_SECRET` | Client Secret |

Use the same pair in both environments. Enter the values directly in GitHub;
do not paste them into chat or commit them.

## 3. Permit the probe on the version paths

Return to **Access controls > Applications**. Create a new application of type
**Self-hosted and private**, named **DEOS portal version checks**. Add two
public hostnames:

| Subdomain | Domain | Path |
| --- | --- | --- |
| `deos` | `voxdez.com` | `/api/version` |
| `deos-staging` | `voxdez.com` | `/api/version` |

Create a policy named **Allow deployment probe**. Set its action to
**Service Auth**. Add an **Include** rule with selector **Service Token** and
value **DEOS portal deployment probe**. Attach it to this application and save.
Keep the hostname paths exactly as above, without a wildcard.

This application grants the service token access to version metadata. The
existing application continues to protect the rest of each portal. The
service token does not grant Cloudflare administration or deployment rights.

## Remaining rollout work

These steps prepare Access. Staging also needs the existing `STAGE_RETRY_SECRET`
installed as a Worker secret. Its value must come from the existing secret
source; Cloudflare cannot reveal a stored Worker secret. Do not rotate the
production or backend secret to complete this setup.

GitHub still needs separate deployment credentials in its two environments.
Those credentials are distinct from the Access probe. No Access administration
or API token management permission is needed for deployment. The accepted
account scope limitation and the remaining release steps are documented in
[portal release](portal-release.md).

## Provider instructions checked on 2026-09-09

- [Self-hosted Access applications](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/)
- [Service tokens](https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/)
- [Application paths and precedence](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/app-paths/)
