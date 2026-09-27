# SAC-253 full D1 schema API probe

*2026-09-27T08:30:45Z by Showboat 0.6.1*
<!-- showboat-id: 4ddfe2c5-4348-4f07-b778-a29178f9c2c0 -->

This applies every local migration to a disposable lease-shaped D1 database, reads the migration ledger back, then deletes the database and checks absence twice. It does not prove a live lease.

```bash
rtk proxy node --experimental-strip-types scripts/probe_shared_test_full_schema_api.mjs
```

```output
create confirmed
full_schema_readback 59_migrations_confirmed
delete_absence confirmed_twice
```
