# SAC-253 Worker assets API probe

*2026-09-27T08:23:35Z by Showboat 0.6.1*
<!-- showboat-id: 028a3b5a-9029-4843-9ffe-161fcd7ff265 -->

This creates a disposable Worker with one static asset, reads its identity tag, then deletes it and confirms absence twice. It proves the remote upload contract, not the full lease app.

```bash
rtk proxy node scripts/probe_shared_test_worker_api.mjs
```

```output
asset_session confirmed
asset_completion confirmed
worker_upload confirmed
settings_tag_readback confirmed
delete_absence confirmed_twice
```
