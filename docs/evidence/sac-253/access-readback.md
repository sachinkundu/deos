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
presence only. A live request to the first lease app must prove that the value
matches the enabled Access token and that the app edge accepts the identity.
