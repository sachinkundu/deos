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

The real Linear Todo event started SAC-166 run 1 on frozen workflow v23. Delivery fb39a85c-e65a-4e81-83e2-f133b6dd5842 was relevant on route revision 12. Attempt 01a08a15-7393-7d2e-b237-3c7ee16ea379 failed before native review: a misplaced supervisor shebang caused a Node parse error. The failure manifest honestly contains no process artifacts. The supervisor was fixed and Docker now checks every runtime module for syntax. This failed run is retained as evidence; the next trial uses a new run and Sandbox.

```bash
rtk proxy python3 /tmp/sac151-cf.py api containers/applications/a0344373-884d-4c06-b4c2-4e58295de498
```

```output
{
  "success": true,
  "result": {
    "id": "a0344373-884d-4c06-b4c2-4e58295de498",
    "created_at": "2026-08-16T07:52:21.590000128Z",
    "updated_at": "2026-09-10T06:56:30.06Z",
    "account_id": "c68856288112af7698f5be52ea94b96e",
    "name": "deos-queue-consumer-ts-sandbox",
    "version": 49,
    "scheduling_policy": "default",
    "instances": 4,
    "max_instances": 4,
    "configuration": {
      "image": "registry.cloudflare.com/c68856288112af7698f5be52ea94b96e/deos-queue-consumer-ts-sandbox@sha256:9cd916c609cb2f6bef62d93380db13ab04a1f4c1398ba36b3848b22f20a5c7f3",
      "vcpu": 0.25,
      "memory": "1GiB",
      "memory_mib": 1024,
      "disk": {
        "size_mb": 4000,
        "size": "4GB"
      },
      "network": {
        "assign_ipv6": "none",
        "assign_ipv4": "none",
        "mode": "private"
      },
      "command": [],
      "entrypoint": [],
      "runtime": "firecracker",
      "observability": {
        "logs": {
          "enabled": true
        }
      }
    },
    "constraints": {
      "tiers": [
        1,
        2
      ]
    },
    "durable_objects": {
      "namespace_id": "3132c2f21e9c48339cb72292268a1589"
    },
    "rollout_active_grace_period": 0,
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
    "network": {
      "bandwidth_limit_mbps": 250
    }
  },
  "messages": [],
  "errors": []
}
```

Run 2 started from another real Linear Todo delivery (c0fefdbd-b965-4670-8353-5b974445325a). Its author attempt is 01a08a1b-4a08-7bf4-8e88-e0f6d0a4a6bc and Sandbox is sbx-v1-omqiapopvtqaanrbnsu4ryg2hxnk5wsnuoyb77l7pezi4v6dntya. The first candidate and native child were recorded under that same attempt. The live run also exposed a five-minute controller polling delay; the new native initial-author path now reconciles every ten seconds. The current run adopted that Worker update without replacing its live author or Sandbox.

The first native child in run 2 failed at 07:06:20 UTC with an encrypted function-output decode error. A protected read-only diagnostic confirmed the exact task_complete error. The v2 native messaging handler treats model messages as encrypted; replacing its message argument in a hook with plaintext broke transport. The implementation now uses the pinned native v1 plain-message interface, selected through Codex model_catalog_json while retaining the provider model metadata and model identity. Child runtime errors are detected even when SubagentStop is absent. The original error was captured in R2 and copied to sac-151-native-transport-failure.json. Run 2 correctly ended as native_review_failed and will not be reported as a passed review.

```bash
rtk proxy python3 /tmp/sac151-status.py
```

```output
[
  {
    "run_sequence": 1,
    "current_node": "agent_failed",
    "status": "failed",
    "definition_version": 23
  },
  {
    "run_sequence": 2,
    "current_node": "agent_failed",
    "status": "failed",
    "definition_version": 23
  },
  {
    "run_sequence": 3,
    "current_node": "planning_author",
    "status": "active",
    "definition_version": 23
  }
]
[
  {
    "attempt_id": "01a08a15-7393-7d2e-b237-3c7ee16ea379",
    "sandbox_id": "sbx-v1-v7gciu545rlvbh7weozhifpft7yzsabrsful5klt2kxsucwfp6sq",
    "node_id": "planning_author",
    "state": "failed",
    "started_at": "2026-09-10T06:51:07.051Z",
    "result_class": "supervisor_failed",
    "result_detail": null
  },
  {
    "attempt_id": "01a08a1b-4a08-7bf4-8e88-e0f6d0a4a6bc",
    "sandbox_id": "sbx-v1-omqiapopvtqaanrbnsu4ryg2hxnk5wsnuoyb77l7pezi4v6dntya",
    "node_id": "planning_author",
    "state": "failed",
    "started_at": "2026-09-10T06:57:28.430Z",
    "result_class": "native_review_failed",
    "result_detail": null
  },
  {
    "attempt_id": "01a08a3a-12cf-751a-a3c8-fcae93993315",
    "sandbox_id": "sbx-v1-fg4onq3et2itrhbn27xpv4l54n5eqr5t4ukgp2sagc7dei37uwaa",
    "node_id": "planning_author",
    "state": "running",
    "started_at": "2026-09-10T07:31:06.661Z",
    "result_class": null,
    "result_detail": null
  }
]
[
  {
    "session_key": "01a08a1b-4a08-7bf4-8e88-e0f6d0a4a6bc:1:0",
    "author_attempt_id": "01a08a1b-4a08-7bf4-8e88-e0f6d0a4a6bc",
    "candidate_sequence": 1,
    "call_index": 0,
    "phase": "planning",
    "state": "started",
    "subagent_id": "01a08a22-f284-79c2-8655-b0fcb9d35a6a",
    "stop_result": null
  }
]
[
  {
    "author_attempt_id": "01a08a1b-4a08-7bf4-8e88-e0f6d0a4a6bc",
    "sequence": 0,
    "kind": "candidate"
  },
  {
    "author_attempt_id": "01a08a1b-4a08-7bf4-8e88-e0f6d0a4a6bc",
    "sequence": 1,
    "kind": "session_allocate"
  },
  {
    "author_attempt_id": "01a08a1b-4a08-7bf4-8e88-e0f6d0a4a6bc",
    "sequence": 2,
    "kind": "session_started"
  }
]
```

Run 3 retained the same author attempt across a Cloudflare internal workflow error. Observation step agent:planning_author:visit:2-20 started at 07:34:59.731 UTC. Its first execution ended at 07:40:01.852 with WorkflowInternalError; the replay succeeded at 07:40:04.235. This was a step replay, not a new author attempt or Sandbox. The author continued to edit and validate the calculator specification.
