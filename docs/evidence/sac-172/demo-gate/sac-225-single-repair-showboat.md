# SAC-225 saved demo findings handed to one author repair

*2026-09-16T05:39:07Z by Showboat 0.6.1*
<!-- showboat-id: 174c0ec0-4a2e-40e9-806e-138db5b42159 -->

```bash
rtk proxy python3 /tmp/sac225-single-repair-readback.py --require-ready
```

```output
{
  "observedAt": "2026-09-16T05:39:10.908533+00:00",
  "sourceCommit": "74043c5",
  "backend": {
    "versions": [
      {
        "version_id": "eaebd3cd-0658-4984-b0bf-f6180e88c6e9",
        "percentage": 100
      }
    ],
    "createdOn": "2026-09-16T05:29:19.382625Z"
  },
  "staging": {
    "versions": [
      {
        "version_id": "ecb24541-09b5-48a3-8285-517f2857e590",
        "percentage": 100
      }
    ],
    "createdOn": "2026-09-16T05:30:45.931518Z"
  },
  "applications": [
    {
      "id": "a030fe98-cbb0-423c-90aa-9e4d9cb896a2",
      "name": "deos-queue-consumer-ts-implementationstandard2sandbox",
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
      "image": "registry.cloudflare.com/c68856288112af7698f5be52ea94b96e/deos-queue-consumer-ts-implementationstandard2sandbox@sha256:6d185a73e2625dbd3229f15198ad71f3fea26355e14ab8c0af2295f71c1d61ac"
    },
    {
      "id": "a03d2322-d47e-405d-86d1-9366e458cf5e",
      "name": "deos-queue-consumer-ts-implementationsandbox",
      "version": 18,
      "health": {
        "errors": [],
        "instances": {
          "active": 0,
          "assigned": 1,
          "healthy": 3,
          "stopped": 0,
          "failed": 0,
          "scheduling": 0,
          "starting": 0
        }
      },
      "image": "registry.cloudflare.com/c68856288112af7698f5be52ea94b96e/deos-queue-consumer-ts-implementationsandbox@sha256:6d185a73e2625dbd3229f15198ad71f3fea26355e14ab8c0af2295f71c1d61ac"
    },
    {
      "id": "a03d8a75-5574-4d37-806d-8b07ed1a79c6",
      "name": "deos-queue-consumer-ts-standard2sandbox",
      "version": 24,
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
      "image": "registry.cloudflare.com/c68856288112af7698f5be52ea94b96e/deos-queue-consumer-ts-standard2sandbox@sha256:6d185a73e2625dbd3229f15198ad71f3fea26355e14ab8c0af2295f71c1d61ac"
    },
    {
      "id": "a0344373-884d-4c06-b4c2-4e58295de498",
      "name": "deos-queue-consumer-ts-sandbox",
      "version": 81,
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
      "image": "registry.cloudflare.com/c68856288112af7698f5be52ea94b96e/deos-queue-consumer-ts-sandbox@sha256:6d185a73e2625dbd3229f15198ad71f3fea26355e14ab8c0af2295f71c1d61ac"
    }
  ],
  "ready": false
}
Traceback (most recent call last):
  File "/tmp/sac225-single-repair-readback.py", line 42, in <module>
    assert snapshot['ready'], 'Container rollout is still pending'
           ~~~~~~~~^^^^^^^^^
AssertionError: Container rollout is still pending
```

The first re-read above used the pre-dispatch warm-pool assertion after the author had already been assigned a container. Before dispatch all four pools were healthy4/4, as recorded in sac-225-single-repair-activation.json. This later observation has three warm healthy and one assigned implementation container, no failed instances, and the expected image. The failed readiness assertion is preserved; it is not an author failure. The next query reads actual author state and checks that no new Claude invocation was made.

```bash
rtk proxy python3 /tmp/sac182-d1-read.py /tmp/sac225-single-repair-progress-query.json
```

```output
{
  "result": [
    {
      "results": [
        {
          "attempt_id": "01a0a884-fcf0-7699-ac70-659be75e098d",
          "kind": "gate",
          "outcome": "needs_work",
          "payload_sha": "ceb38fa5326a64e9f1524c597e4a107310008d516bc9eeba77f9f8e5500f09ad"
        },
        {
          "attempt_id": "01a0a85c-1819-767f-9b44-d260865c1c3f",
          "kind": "plan",
          "outcome": "ready",
          "payload_sha": "ef16d0f2f73b8c432ddecb68183f6fdf11cb103a4da35b888876b86d537eef54"
        }
      ],
      "success": true,
      "meta": {
        "served_by": "v3-prod",
        "served_by_region": "WEUR",
        "served_by_colo": "AMS",
        "served_by_primary": true,
        "timings": {
          "sql_duration_ms": 0.4369
        },
        "duration": 0.4369,
        "changes": 0,
        "last_row_id": 3871,
        "changed_db": false,
        "size_after": 100458496,
        "rows_read": 2,
        "rows_written": 0,
        "total_attempts": 1
      }
    },
    {
      "results": [
        {
          "attempt_id": "01a0a8b7-340b-727d-8db1-b4d1f2ef0287",
          "node_id": "implementation_build",
          "state": "running",
          "created_at": "2026-09-16T05:36:13.835Z"
        }
      ],
      "success": true,
      "meta": {
        "served_by": "v3-prod",
        "served_by_region": "WEUR",
        "served_by_colo": "AMS",
        "served_by_primary": true,
        "timings": {
          "sql_duration_ms": 1.7424
        },
        "duration": 1.7424,
        "changes": 0,
        "last_row_id": 3871,
        "changed_db": false,
        "size_after": 100458496,
        "rows_read": 564,
        "rows_written": 0,
        "total_attempts": 1
      }
    },
    {
      "results": [
        {
          "completed": 25,
          "total": 25,
          "observed_at": "2026-09-16T05:36:38.727Z"
        }
      ],
      "success": true,
      "meta": {
        "served_by": "v3-prod",
        "served_by_region": "WEUR",
        "served_by_colo": "AMS",
        "served_by_primary": true,
        "timings": {
          "sql_duration_ms": 0.1195
        },
        "duration": 0.1195,
        "changes": 0,
        "last_row_id": 3871,
        "changed_db": false,
        "size_after": 100458496,
        "rows_read": 1,
        "rows_written": 0,
        "total_attempts": 1
      }
    },
    {
      "results": [],
      "success": true,
      "meta": {
        "served_by": "v3-prod",
        "served_by_region": "WEUR",
        "served_by_colo": "AMS",
        "served_by_primary": true,
        "timings": {
          "sql_duration_ms": 0.2695
        },
        "duration": 0.2695,
        "changes": 0,
        "last_row_id": 3871,
        "changed_db": false,
        "size_after": 100458496,
        "rows_read": 1,
        "rows_written": 0,
        "total_attempts": 1
      }
    },
    {
      "results": [
        {
          "new_claude_invocations": 0
        }
      ],
      "success": true,
      "meta": {
        "served_by": "v3-prod",
        "served_by_region": "WEUR",
        "served_by_colo": "AMS",
        "served_by_primary": true,
        "timings": {
          "sql_duration_ms": 1.2713
        },
        "duration": 1.2713,
        "changes": 0,
        "last_row_id": 3871,
        "changed_db": false,
        "size_after": 100458496,
        "rows_read": 570,
        "rows_written": 0,
        "total_attempts": 1
      }
    },
    {
      "results": [
        {
          "pr_number": null,
          "pr_url": null,
          "status": "proof",
          "tree_sha": "8eb184220d08673abb7564089d72420f2dd54eb5"
        }
      ],
      "success": true,
      "meta": {
        "served_by": "v3-prod",
        "served_by_region": "WEUR",
        "served_by_colo": "AMS",
        "served_by_primary": true,
        "timings": {
          "sql_duration_ms": 0.1141
        },
        "duration": 0.1141,
        "changes": 0,
        "last_row_id": 3871,
        "changed_db": false,
        "size_after": 100458496,
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
