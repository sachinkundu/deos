# SAC-253 staging bootstrap remote read-back

*2026-09-25T07:48:08Z by Showboat 0.6.1*
<!-- showboat-id: 5f9e9b9c-a559-42fb-aea0-3c5f2e124fcd -->

Read-only D1 state after migration 0055. The site remains free and the staging release pointer is uninitialized until both staging Workers are live.

```bash
python3 scripts/check_shared_test_bootstrap.py
```

```output
{"activeAttempts": {"count": 0}, "migration": {"name": "0055_shared_test_environment.sql"}, "pointer": {"manifest_id": null, "revision": 0, "state": "uninitialized"}, "site": {"fence": 0, "owner_lease_id": null, "owner_run_id": null, "state": "free"}}
```
