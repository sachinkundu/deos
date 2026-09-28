# SAC-253 candidate build and upload readback

On 28 September 2026, [GitHub run 36394929793](https://github.com/sachinkundu/deos/actions/runs/36394929793)
checked out exact candidate commit `51e7c78e53b931e923ca700a10a60da9b683202f`.
The credential-free `build (portal)` and `build (bettaview)` jobs passed and
produced separate bundle and receipt artifacts. Both isolated uploader jobs
failed on their first Wrangler R2 object write with HTTP 403, Cloudflare code
10000 `Authentication error`. The rejected bucket was
`deos-sample-project-artifacts`. GitHub supplied the `staging` environment's
`PORTAL_STAGING_CLOUDFLARE_API_TOKEN`; the value was not displayed.

The two GitHub artifacts were downloaded. The trusted uploader validated each
receipt and bundle, then used the local operator credential to put and get the
same immutable object. Both byte-for-byte SHA-256 readbacks passed:

| Service | Build input SHA-256 | Bundle SHA-256 |
| --- | --- | --- |
| portal | `2e3f7cc7dc56b60d58b4e99f2fbae60debe74c48a07a103598a18feac7269b7c` | `a97d1249b886f43554ed0f36157432008ef28d56efe09da30f08987e613fc102` |
| bettaview | `a0041a2fffd24c3d56d344bb3cba0cfadbe73609d6c3b961e066f94ff30f4af0` | `6474513e6563f3b14987af5287352df0ad1fe4d7255e7c08b7f3c67681c67eb8` |

This verifies the build and uploader code path with real R2 readback. It does
not make the GitHub upload job green; its environment secret needs bucket object
read/write permission before another dispatch can pass unattended.
