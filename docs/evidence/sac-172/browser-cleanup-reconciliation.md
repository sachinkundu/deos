# SAC-172: terminal browser cleanup reconciliation

*2026-09-15T10:22:21Z by Showboat 0.6.1*
<!-- showboat-id: 2481dba9-2a78-47b2-b16b-5779199c4da8 -->

```bash
rtk proxy python3 /tmp/sac182-d1-read.py /tmp/sac172-browser-cleanup-check.json

```

```output
{
  "result": [
    {
      "results": [
        {
          "attempt_id": "01a0a407-62dc-7bc0-95e6-965a0a818188",
          "state": "completed",
          "cleanup_state": "destroyed",
          "browser_status": "destroyed",
          "cleanup_receipt": "{\"absent\":\"b0565106-184c-4acd-99ca-6bbb765228b7\"}",
          "updated_at": "2026-09-15T08:13:09.221Z"
        },
        {
          "attempt_id": "01a0a436-6328-7de2-bdfe-67b82f4cfcb2",
          "state": "failed",
          "cleanup_state": "destroyed",
          "browser_status": "ready",
          "cleanup_receipt": null,
          "updated_at": "2026-09-15T08:57:44.939Z"
        },
        {
          "attempt_id": "01a0a466-1267-734d-9ac7-59120044a1b4",
          "state": "completed",
          "cleanup_state": "destroyed",
          "browser_status": "ready",
          "cleanup_receipt": null,
          "updated_at": "2026-09-15T10:04:54.852Z"
        }
      ],
      "success": true,
      "meta": {
        "served_by": "v3-prod",
        "served_by_region": "WEUR",
        "served_by_colo": "AMS",
        "served_by_primary": true,
        "timings": {
          "sql_duration_ms": 0.6452
        },
        "duration": 0.6452,
        "changes": 0,
        "last_row_id": 0,
        "changed_db": false,
        "size_after": 94425088,
        "rows_read": 31,
        "rows_written": 0,
        "total_attempts": 1
      }
    },
    {
      "results": [
        {
          "status": "awaiting_human",
          "current_node": "implementation_review",
          "current_visit_sequence": 55
        }
      ],
      "success": true,
      "meta": {
        "served_by": "v3-prod",
        "served_by_region": "WEUR",
        "served_by_colo": "AMS",
        "served_by_primary": true,
        "timings": {
          "sql_duration_ms": 0.2123
        },
        "duration": 0.2123,
        "changes": 0,
        "last_row_id": 0,
        "changed_db": false,
        "size_after": 94425088,
        "rows_read": 1,
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

```bash
rtk proxy python3 /tmp/sac182-d1-read.py /tmp/sac172-browser-cleanup-check.json

```

```output
{
  "result": [
    {
      "results": [
        {
          "attempt_id": "01a0a407-62dc-7bc0-95e6-965a0a818188",
          "state": "completed",
          "cleanup_state": "destroyed",
          "browser_status": "destroyed",
          "cleanup_receipt": "{\"absent\":\"b0565106-184c-4acd-99ca-6bbb765228b7\"}",
          "updated_at": "2026-09-15T08:13:09.221Z"
        },
        {
          "attempt_id": "01a0a436-6328-7de2-bdfe-67b82f4cfcb2",
          "state": "failed",
          "cleanup_state": "destroyed",
          "browser_status": "destroyed",
          "cleanup_receipt": "{\"absent\":\"14d88214-c26e-4ac9-94f4-7294b3e2a5b1\"}",
          "updated_at": "2026-09-15T10:31:06.666Z"
        },
        {
          "attempt_id": "01a0a466-1267-734d-9ac7-59120044a1b4",
          "state": "completed",
          "cleanup_state": "destroyed",
          "browser_status": "destroyed",
          "cleanup_receipt": "{\"absent\":\"4dca67f1-f32b-4088-b829-ed5a42a19b93\"}",
          "updated_at": "2026-09-15T10:31:06.029Z"
        }
      ],
      "success": true,
      "meta": {
        "served_by": "v3-prod",
        "served_by_region": "WEUR",
        "served_by_colo": "AMS",
        "served_by_primary": true,
        "timings": {
          "sql_duration_ms": 0.3395
        },
        "duration": 0.3395,
        "changes": 0,
        "last_row_id": 0,
        "changed_db": false,
        "size_after": 94425088,
        "rows_read": 31,
        "rows_written": 0,
        "total_attempts": 1
      }
    },
    {
      "results": [
        {
          "status": "awaiting_human",
          "current_node": "implementation_review",
          "current_visit_sequence": 55
        }
      ],
      "success": true,
      "meta": {
        "served_by": "v3-prod",
        "served_by_region": "WEUR",
        "served_by_colo": "AMS",
        "served_by_primary": true,
        "timings": {
          "sql_duration_ms": 0.1176
        },
        "duration": 0.1176,
        "changes": 0,
        "last_row_id": 0,
        "changed_db": false,
        "size_after": 94425088,
        "rows_read": 1,
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
