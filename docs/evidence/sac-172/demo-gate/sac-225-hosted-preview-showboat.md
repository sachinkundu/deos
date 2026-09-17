# SAC-225 hosted preview support activation

*2026-09-16T00:13:07Z by Showboat 0.6.1*
<!-- showboat-id: 7893d125-609f-4e7d-b115-4650ef7afe9d -->

```bash
rtk proxy python3 /tmp/sac225-hosted-preview-readback.py

```

```output
{
  "observedAt": "2026-09-16T00:13:10.290632+00:00",
  "sourceCommit": "e6e63e7",
  "backend": {
    "versions": [
      {
        "version_id": "7c2910da-b0e2-4851-af1b-1177513577c4",
        "percentage": 100
      }
    ],
    "createdOn": "2026-09-16T00:10:59.5057Z"
  },
  "staging": {
    "versions": [
      {
        "version_id": "c0dcc4b3-4275-4e1e-b3d1-56176c8e6923",
        "percentage": 100
      }
    ],
    "createdOn": "2026-09-15T23:34:27.972054Z"
  },
  "applications": [
    {
      "id": "a030fe98-cbb0-423c-90aa-9e4d9cb896a2",
      "name": "deos-queue-consumer-ts-implementationstandard2sandbox",
      "version": 16,
      "health": {
        "errors": [],
        "instances": {
          "active": 0,
          "assigned": 0,
          "healthy": 4,
          "stopped": 0,
          "failed": 0,
          "scheduling": 0,
          "starting": 0
        }
      },
      "image": "registry.cloudflare.com/c68856288112af7698f5be52ea94b96e/deos-queue-consumer-ts-implementationstandard2sandbox@sha256:3157a377247c5e6bb659a500e9e3cb018407a1813a41d208667e8689bdbf592c"
    },
    {
      "id": "a03d2322-d47e-405d-86d1-9366e458cf5e",
      "name": "deos-queue-consumer-ts-implementationsandbox",
      "version": 17,
      "health": {
        "errors": [],
        "instances": {
          "active": 0,
          "assigned": 0,
          "healthy": 4,
          "stopped": 0,
          "failed": 0,
          "scheduling": 0,
          "starting": 0
        }
      },
      "image": "registry.cloudflare.com/c68856288112af7698f5be52ea94b96e/deos-queue-consumer-ts-implementationsandbox@sha256:3157a377247c5e6bb659a500e9e3cb018407a1813a41d208667e8689bdbf592c"
    },
    {
      "id": "a03d8a75-5574-4d37-806d-8b07ed1a79c6",
      "name": "deos-queue-consumer-ts-standard2sandbox",
      "version": 22,
      "health": {
        "errors": [],
        "instances": {
          "active": 0,
          "assigned": 0,
          "healthy": 1,
          "stopped": 0,
          "failed": 0,
          "scheduling": 0,
          "starting": 3
        }
      },
      "image": "registry.cloudflare.com/c68856288112af7698f5be52ea94b96e/deos-queue-consumer-ts-standard2sandbox@sha256:3157a377247c5e6bb659a500e9e3cb018407a1813a41d208667e8689bdbf592c"
    },
    {
      "id": "a0344373-884d-4c06-b4c2-4e58295de498",
      "name": "deos-queue-consumer-ts-sandbox",
      "version": 80,
      "health": {
        "errors": [],
        "instances": {
          "active": 0,
          "assigned": 0,
          "healthy": 4,
          "stopped": 0,
          "failed": 0,
          "scheduling": 0,
          "starting": 0
        }
      },
      "image": "registry.cloudflare.com/c68856288112af7698f5be52ea94b96e/deos-queue-consumer-ts-sandbox@sha256:3157a377247c5e6bb659a500e9e3cb018407a1813a41d208667e8689bdbf592c"
    }
  ],
  "ready": false
}
```

```bash
rtk proxy python3 /tmp/sac182-d1-read.py /tmp/sac225-hosted-preview-state-query.json

```

```output
{
  "result": [
    {
      "results": [
        {
          "run_id": "workflow:99426d9b-cda7-4db4-9136-692a95a0b090:d5dc0e9d-be0d-4504-82a1-62c14340c91c:run:1",
          "status": "failed",
          "current_node": "implementation_failed",
          "current_visit_sequence": 36,
          "definition_version": 30
        }
      ],
      "success": true,
      "meta": {
        "served_by": "v3-prod",
        "served_by_region": "WEUR",
        "served_by_colo": "AMS",
        "served_by_primary": true,
        "timings": {
          "sql_duration_ms": 0.219
        },
        "duration": 0.219,
        "changes": 0,
        "last_row_id": 0,
        "changed_db": false,
        "size_after": 98951168,
        "rows_read": 90,
        "rows_written": 0,
        "total_attempts": 1
      }
    },
    {
      "results": [
        {
          "run_id": "workflow:99426d9b-cda7-4db4-9136-692a95a0b090:d5dc0e9d-be0d-4504-82a1-62c14340c91c:run:1",
          "input_sha": "f0dd8c4f8ee8c6abfeb52b2f865ce22ac0db66211710460309ed3941a3159a3b",
          "candidate_sha": "0ee4ac484c25226c1b35209a96cea27a2aa1e5867fd0f2cf046b9028502faf8e",
          "tree_sha": "8eb184220d08673abb7564089d72420f2dd54eb5",
          "tested_base_sha": "a1dcf3d18e0d20e483e507079a1e1fbe8b490686",
          "pr_url": null
        }
      ],
      "success": true,
      "meta": {
        "served_by": "v3-prod",
        "served_by_region": "WEUR",
        "served_by_colo": "AMS",
        "served_by_primary": true,
        "timings": {
          "sql_duration_ms": 0.2185
        },
        "duration": 0.2185,
        "changes": 0,
        "last_row_id": 0,
        "changed_db": false,
        "size_after": 98951168,
        "rows_read": 91,
        "rows_written": 0,
        "total_attempts": 1
      }
    },
    {
      "results": [
        {
          "name": "implementation_hosted_previews",
          "sql": "CREATE TABLE implementation_hosted_previews (\n  registration_id TEXT PRIMARY KEY,\n  run_id TEXT NOT NULL REFERENCES implementation_runs(run_id),\n  input_sha TEXT NOT NULL,\n  candidate_sha TEXT NOT NULL,\n  tree_sha TEXT NOT NULL,\n  receipt_key TEXT NOT NULL,\n  receipt_sha TEXT NOT NULL,\n  created_at TEXT NOT NULL\n)"
        },
        {
          "name": "implementation_hosted_preview_immutable",
          "sql": "CREATE TRIGGER implementation_hosted_preview_immutable\nBEFORE UPDATE ON implementation_hosted_previews\nBEGIN SELECT RAISE(ABORT, 'hosted preview registration is immutable'); END"
        }
      ],
      "success": true,
      "meta": {
        "served_by": "v3-prod",
        "served_by_region": "WEUR",
        "served_by_colo": "AMS",
        "served_by_primary": true,
        "timings": {
          "sql_duration_ms": 0.1675
        },
        "duration": 0.1675,
        "changes": 0,
        "last_row_id": 0,
        "changed_db": false,
        "size_after": 98951168,
        "rows_read": 307,
        "rows_written": 0,
        "total_attempts": 1
      }
    },
    {
      "results": [
        {
          "registered_previews": 0
        }
      ],
      "success": true,
      "meta": {
        "served_by": "v3-prod",
        "served_by_region": "WEUR",
        "served_by_colo": "AMS",
        "served_by_primary": true,
        "timings": {
          "sql_duration_ms": 0.066
        },
        "duration": 0.066,
        "changes": 0,
        "last_row_id": 0,
        "changed_db": false,
        "size_after": 98951168,
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

```bash
rtk proxy python3 /tmp/sac225-hosted-preview-route-check.py

```

```output
[
  {
    "method": "GET",
    "status": 405,
    "body": {
      "error": "method_not_allowed"
    }
  },
  {
    "method": "POST",
    "status": 401,
    "body": {
      "error": "invalid_operator_capability"
    }
  }
]
```

```bash
rtk proxy python3 /tmp/sac225-authorized-pages-operator.py read
rtk proxy python3 /tmp/sac225-hosted-live-summary.py

```

```output
{
  "id": "11fa3ef4-fb4e-422e-93d7-3da6de660c9d",
  "project_id": "daa31fe2-6778-4317-a527-f89811f93010",
  "project_name": "sac-225-calculator",
  "environment": "preview",
  "url": "https://11fa3ef4.sac-225-calculator.pages.dev",
  "created_on": "2026-09-16T03:52:44.751904Z",
  "short_id": "11fa3ef4",
  "status": "success",
  "branch": "review-sac-225"
}
{
  "run": [
    {
      "status": "active",
      "current_node": "implementation_demo_plan",
      "current_visit_sequence": 37,
      "definition_version": 31,
      "definition_digest": "177e21cdfdb99ebba377670e98c5837609f7a2f33655124e107fe12094d3b98c",
      "workflow_instance_id": "wf-v1-iihutseczcz7negzrwyhn3g37gukcbkzsy7sc4zq4otuumks7nwa",
      "updated_at": "2026-09-16T03:56:36.745Z"
    }
  ],
  "latestAttempt": [
    {
      "attempt_id": "01a0a85c-1819-767f-9b44-d260865c1c3f",
      "node_id": "implementation_demo_plan",
      "visit_sequence": 37,
      "state": "running",
      "sandbox_id": "sbx-v1-nwiiopwioeoqk2ojgcv3k3drrdmy6jlfrmwybhrq36zaqglf7cxa",
      "sandbox_tier": "basic",
      "heartbeat_at": "2026-09-16T03:56:51.459Z",
      "process_id": "12c8dfa6-6da4-4243-bc3f-610a16fee50b",
      "result_class": null,
      "cleanup_state": "pending",
      "created_at": "2026-09-16T03:56:42.905Z",
      "ended_at": null
    }
  ],
  "latestDemoReview": [
    {
      "attempt_id": "01a0a718-6bea-70d3-bf83-14f5bfd49e05",
      "kind": "plan",
      "outcome": "ready",
      "payload_sha": "38675909e511a44f300edc6752d23c1f706a89180e5a8760948d234217f2962f",
      "created_at": "2026-09-15T22:06:02.752Z"
    }
  ],
  "hostedPreview": [
    {
      "registration_id": "30def9095a61f81951f8d0e6100cb095503945341bcd2ee6ddbdca62cd54f837",
      "receipt_key": "implementation/workflow:99426d9b-cda7-4db4-9136-692a95a0b090:d5dc0e9d-be0d-4504-82a1-62c14340c91c:run:1/b0f868eefdd282af34af0c543d51d06b1fb50f0b2d6ee876eadc2b65e2ec2cd6/hosted-preview.json",
      "receipt_sha": "b0f868eefdd282af34af0c543d51d06b1fb50f0b2d6ee876eadc2b65e2ec2cd6",
      "created_at": "2026-09-16T03:55:53.899Z"
    }
  ],
  "recentErrors": [
    {
      "step_name": "/implementation-demo-upgrades",
      "message": "(instance.not_found) Instance not found",
      "detail_r2_key": "original-errors/workflow%3A99426d9b-cda7-4db4-9136-692a95a0b090%3Ad5dc0e9d-be0d-4504-82a1-62c14340c91c%3Arun%3A1/4b7e331d-9215-449a-ad93-0a4df28b01c2.json",
      "occurred_at": "2026-09-16T03:56:37.695Z"
    },
    {
      "step_name": "/implementation-hosted-previews",
      "message": "Invalid redirect value, must be one of \"follow\" or \"manual\" (\"error\" won't be implemented since it does not make sense at the edge; use \"manual\" and check the response status code).",
      "detail_r2_key": "original-errors/workflow%3A99426d9b-cda7-4db4-9136-692a95a0b090%3Ad5dc0e9d-be0d-4504-82a1-62c14340c91c%3Arun%3A1/d2a5de61-8ef9-4c3e-a33a-cd50dd7e19d8.json",
      "occurred_at": "2026-09-16T03:53:26.234Z"
    }
  ]
}
```
