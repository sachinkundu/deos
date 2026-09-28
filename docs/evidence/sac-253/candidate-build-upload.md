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

This verifies the build and uploader code path for the SAC-253 implementation
commit with real R2 readback. It does
not make the GitHub upload job green. The implementation workflow now uses a
separate `SHARED_TEST_R2_UPLOAD_TOKEN` GitHub environment secret so the portal
staging deploy token does not gain R2 access. A scoped bucket token must be
saved before another dispatch can pass unattended. SAC-182 uses a different
candidate commit; its exact bundle readback is recorded below.

## SAC-182 exact candidate

On 28 September 2026, [GitHub run 36404953852](https://github.com/sachinkundu/deos/actions/runs/36404953852)
checked out PR #137 head `e04d76cbe32f72c9390c95b6ef33623ddfa2db26`.
The credential-free portal and BettaView build jobs passed. Their separate
receipts name that exact commit. The trusted uploader validated the downloaded
GitHub artifacts, put them in private R2 using the local operator credential,
then downloaded both objects and compared SHA-256:

| Service | Build input SHA-256 | Bundle SHA-256 |
| --- | --- | --- |
| portal | `b862d68255b3770403782358687d43b7fa48f5eb3e4640bb12ec34484a3d7cca` | `d1da3586dfe64e8c1b0c19b06fa80013af71b00790b5ab4bacb1babbc1c6bd5c` |
| bettaview | `12f55817c880ae6452f78baa6d97139361226af071fb0e2306e9aca15fbc3a99` | `9652bbb12b355cd370bb93822fdb360aa79bce2b514735396f613e4df17c0180` |

These are the SAC-182 candidate bundles. The build and upload proof does not
show that a lease was granted, candidate Workers were deployed, or a real app
demo ran.
