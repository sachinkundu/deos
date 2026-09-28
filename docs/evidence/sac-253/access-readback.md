# SAC-253 lease app Access readback

Checked in the Cloudflare One dashboard on 28 September 2026. This is setup
evidence, not a successful browser admission result.

| Item | Saved readback |
| --- | --- |
| Application | `DEOS shared test apps`, ID `b836123d-bf08-4735-9bde-2a022c4699c5` |
| Public hostname | `*.apps.deos-test.voxdez.com`, empty path |
| Audience | `2142eb74725a50ca4b3a8ec6da3204ad3cd46850af731d89e96c04cca6b0d99c` |
| Service Auth | `Shared Test Browser`, policy ID `cbeedbcd-7717-4d4d-b773-93592a9073eb`; Include Service Token `DEOS shared test browser` only |
| Service token | `DEOS shared test browser`, enabled, token record ID `a3b87167-e67f-4fdb-a8c1-ef84af848895` |
| Client ID | `999e333296e42d69bc56b6529dcebd18.access` |
| Human Allow | Owner email rule, plus Cloudflare account members as accepted by the operator |
| Worker secret names | `TEST_APP_SERVICE_CLIENT_SECRET` and `TEST_MARKER_KEY_V1` on `deos-queue-consumer-ts` |
| Token usage | `Not Seen Yet` at readback |

The Client Secret value was not read or copied. Its name in the Worker proves
presence only. On 28 September, the first lease created both app Workers and
their custom domains. The portal host has a valid TLS certificate and reaches
the `DEOS shared test apps` Access application. The controller sends the saved
Client ID and Worker secret to `/api/version`, but Access returns HTTP 302 to
its login page. The service token still shows `Not Seen Yet` after those
requests. The Service Auth policy still includes only this token, and the token
is enabled and assigned to the app. Browser admission remains unproven. The
operator must re-enter the matching one-time Client Secret in the Worker secret
or rotate the token and enter its replacement secret. No secret belongs in this
evidence file.
