# SAC-253 merged staging base and coordinator readback

*2026-09-28T07:47:57Z by Showboat 0.6.1*
<!-- showboat-id: 09589500-e902-4dc8-874d-6e958b97775b -->

The staging Workers were built from merged main commit f8275c1e21a420febeed40139e16fd90605f7b80. Their exact bundles were uploaded to private R2 and downloaded for hash comparison. The BettaView staging Worker was initially absent. The main GitHub deployment job stopped with HTTP 403 because its older script queried D1 using a staging credential without D1 scope; the implementation script removes that dependency. The local Cloudflare credential could deploy Workers and bind custom domains but could not read zone Worker routes (HTTP 403), so both staging Workers were deployed with temporary route-free Wrangler config and their domain bindings were confirmed through the Workers Domains API. The temporary configs were removed. The coordinator was deployed with grants disabled. Its first pointer refresh failed with staging_host_version_invalid because the older portal staging Worker lacked a complete version record; after deploying merged main portal bytes, the refresh succeeded. No shared test lease has been granted.

```bash
rtk proxy python3 scripts/check_shared_test_bootstrap.py
```

```output
{"activeAttempts": [], "migration": {"name": "0055_shared_test_environment.sql"}, "pointer": {"manifest_id": "manifest:4747b7c9d18cbf71eea72076e37520a5d30437926af49de8fcefd69de62a4b50", "revision": 2, "state": "stable"}, "site": {"fence": 0, "owner_lease_id": null, "owner_run_id": null, "state": "free"}, "stagingServices": [{"build_input_sha256": "3857d8219c43c94624357ff1516017cef7d477d32071430810e0a3c18e960898", "deploy_version": "58c984df-efce-412f-977c-deb407e6f487", "service_name": "bettaview", "source_commit": "f8275c1e21a420febeed40139e16fd90605f7b80"}, {"build_input_sha256": "012c157990d91c43fb0f92c4b1ac1682cc399b643fc23b5e9ba98f3d4d2f3d58", "deploy_version": "2304f455-00aa-4db2-be4e-b4c655b2a602", "service_name": "portal", "source_commit": "f8275c1e21a420febeed40139e16fd90605f7b80"}]}
```
