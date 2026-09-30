# SAC-253 D1 schema API probe

*2026-09-27T08:10:02Z by Showboat 0.6.1*
<!-- showboat-id: 1bffa691-48ec-4849-b035-b17fcec371ae -->

This creates a disposable D1 database, applies a real multi-statement query, reads it back, then deletes the database and confirms its name is absent twice. This proves only the remote D1 query contract used by schema setup.

```bash
rtk proxy python3 scripts/probe_shared_test_schema_api.py
```

```output
probe temporary database
create confirmed
multi_statement_readback confirmed
delete_absence confirmed_twice
```
