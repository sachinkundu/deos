# SAC-253 R2 cleanup API probe

*2026-09-27T08:32:50Z by Showboat 0.6.1*
<!-- showboat-id: 79aa2148-f09c-40c0-9a07-a3662cda1ff0 -->

This creates a disposable R2 bucket and nested object, deletes both through the lease cleanup adapter, and confirms the bucket is absent twice. It does not prove a live lease.

```bash
rtk proxy node --experimental-strip-types scripts/probe_shared_test_r2_cleanup_api.mjs
```

```output
bucket_create confirmed
nested_object_upload confirmed
object_and_bucket_cleanup confirmed
delete_absence confirmed_twice
```
