# SAC-151 calculator canary

*2026-09-10T06:43:33Z by Showboat 0.6.1*
<!-- showboat-id: 845a9317-9511-4261-a2e4-60f5520973f0 -->

SAC-166 is a fresh calculator trial in the sample project. It covers arithmetic, Celsius/Fahrenheit, and degrees/radians. The user authorized review comments, rework requests, and human-review transitions for this trial. Local runtime checks below are distinct from the provider and Cloudflare evidence recorded later.

```bash
rtk proxy cat docs/evidence/sac-151-native-loop.json
```

```output
{
  "evidence_class": "local-scripted-production-hook-integration",
  "checks": {
    "exit_success": true,
    "loop_completed": true,
    "two_fresh_children": true,
    "read_only": true,
    "one_author_attempt": true,
    "no_controller_failures": true
  },
  "passed": true,
  "controller_errors": []
}```
```

```bash
rtk proxy python3 /tmp/sac151-cf.py query "SELECT definition_id,version,digest FROM workflow_definitions WHERE definition_id='simple-traceability' ORDER BY version DESC LIMIT 2; SELECT COUNT(*) AS native_sessions FROM self_review_sessions;"
```

```output
{
  "result": [
    {
      "results": [
        {
          "definition_id": "simple-traceability",
          "version": 22,
          "digest": "f7452076278b3224df91f60e9f749e9be5249ea5baeda886c12e391ab68f8b60"
        },
        {
          "definition_id": "simple-traceability",
          "version": 21,
          "digest": "4318af1a32a590d9888efc7787acb7cf2b59b115798b103fb3db54cc8458a292"
        }
      ],
      "success": true,
      "meta": {
        "served_by": "v3-prod",
        "served_by_region": "WEUR",
        "served_by_colo": "AMS",
        "served_by_primary": true,
        "timings": {
          "sql_duration_ms": 1.7577
        },
        "duration": 1.7577,
        "changes": 0,
        "last_row_id": 0,
        "changed_db": false,
        "size_after": 24756224,
        "rows_read": 2,
        "rows_written": 0,
        "total_attempts": 1
      }
    },
    {
      "results": [
        {
          "native_sessions": 0
        }
      ],
      "success": true,
      "meta": {
        "served_by": "v3-prod",
        "served_by_region": "WEUR",
        "served_by_colo": "AMS",
        "served_by_primary": true,
        "timings": {
          "sql_duration_ms": 0.1885
        },
        "duration": 0.1885,
        "changes": 0,
        "last_row_id": 0,
        "changed_db": false,
        "size_after": 24756224,
        "rows_read": 0,
        "rows_written": 0,
        "total_attempts": 1
      }
    }
  ],
  "errors": [],
  "messages": [],
  "success": true
}
```
