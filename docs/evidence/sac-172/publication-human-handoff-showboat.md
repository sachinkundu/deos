# SAC-172 publication blocker human handoff

*2026-09-16T09:23:23Z by Showboat 0.6.1*
<!-- showboat-id: b4cd9854-1161-44e0-adcd-0727643463ab -->

```bash
rtk proxy python3 /tmp/sac172-handoff-rollout.py --env-file /Users/sachin/code/deos/.env
```

```output
{
  "deployments": {
    "deos-queue-consumer-ts": {
      "versions": [
        {
          "version_id": "8b3b8e71-d732-4140-b832-7261b72640da",
          "percentage": 100
        }
      ],
      "created_on": "2026-09-16T09:14:33.885136Z"
    },
    "deos-sample-project": {
      "versions": [
        {
          "version_id": "7dcb3e04-2c21-4f8f-ab26-b389d4f8c175",
          "percentage": 100
        }
      ],
      "created_on": "2026-09-14T12:29:19.555854Z"
    },
    "deos-workflow-portal-staging": {
      "versions": [
        {
          "version_id": "a7aa4e85-1a53-4cee-b9da-72f15cae008c",
          "percentage": 100
        }
      ],
      "created_on": "2026-09-16T09:16:24.328259Z"
    }
  },
  "containers": [
    {
      "name": "deos-queue-consumer-ts-implementationstandard2sandbox",
      "image": "registry.cloudflare.com/c68856288112af7698f5be52ea94b96e/deos-queue-consumer-ts-implementationstandard2sandbox@sha256:062e5dec9a2d502449a8ccddce62f718be94fc8e16cf5be2642cf308b6456445",
      "version": 18,
      "rollout": "completed",
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
      "progress": {
        "total_steps": 2,
        "current_step": 2,
        "updated_instances": 4,
        "total_instances": 4,
        "version_distribution": {
          "target_version_instances": 4,
          "current_version_instances": 0,
          "target_version_percentage": 100
        }
      }
    },
    {
      "name": "deos-queue-consumer-ts-implementationsandbox",
      "image": "registry.cloudflare.com/c68856288112af7698f5be52ea94b96e/deos-queue-consumer-ts-implementationsandbox@sha256:062e5dec9a2d502449a8ccddce62f718be94fc8e16cf5be2642cf308b6456445",
      "version": 19,
      "rollout": "completed",
      "health": {
        "errors": [],
        "instances": {
          "active": 1,
          "assigned": 0,
          "healthy": 3,
          "stopped": 0,
          "failed": 0,
          "scheduling": 0,
          "starting": 0
        }
      },
      "progress": {
        "total_steps": 2,
        "current_step": 2,
        "updated_instances": 4,
        "total_instances": 4,
        "version_distribution": {
          "target_version_instances": 4,
          "current_version_instances": 0,
          "target_version_percentage": 100
        }
      }
    },
    {
      "name": "deos-queue-consumer-ts-standard2sandbox",
      "image": "registry.cloudflare.com/c68856288112af7698f5be52ea94b96e/deos-queue-consumer-ts-standard2sandbox@sha256:062e5dec9a2d502449a8ccddce62f718be94fc8e16cf5be2642cf308b6456445",
      "version": 26,
      "rollout": "completed",
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
      "progress": {
        "total_steps": 2,
        "current_step": 2,
        "updated_instances": 4,
        "total_instances": 4,
        "version_distribution": {
          "target_version_instances": 4,
          "current_version_instances": 0,
          "target_version_percentage": 100
        }
      }
    },
    {
      "name": "deos-queue-consumer-ts-sandbox",
      "image": "registry.cloudflare.com/c68856288112af7698f5be52ea94b96e/deos-queue-consumer-ts-sandbox@sha256:062e5dec9a2d502449a8ccddce62f718be94fc8e16cf5be2642cf308b6456445",
      "version": 82,
      "rollout": "completed",
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
      "progress": {
        "total_steps": 2,
        "current_step": 2,
        "updated_instances": 4,
        "total_instances": 4,
        "version_distribution": {
          "target_version_instances": 4,
          "current_version_instances": 0,
          "target_version_percentage": 100
        }
      }
    }
  ]
}
```

```bash
rtk proxy python3 /tmp/sac182-d1-read.py /tmp/sac225-publication-human-proof-query.json
```

```output
{
  "result": [
    {
      "results": [
        {
          "retry_kind": "compatible_tail",
          "state": "established",
          "source_definition_version": 33,
          "target_definition_version": 36,
          "retry_node": "implementation_branch_write",
          "created_at": "2026-09-16T09:16:57.439Z",
          "established_at": "2026-09-16T09:16:59.876Z"
        }
      ],
      "success": true,
      "meta": {
        "served_by": "v3-prod",
        "served_by_region": "WEUR",
        "served_by_colo": "AMS",
        "served_by_primary": true,
        "timings": {
          "sql_duration_ms": 0.1715
        },
        "duration": 0.1715,
        "changes": 0,
        "last_row_id": 211,
        "changed_db": false,
        "size_after": 101531648,
        "rows_read": 1,
        "rows_written": 0,
        "total_attempts": 1
      }
    },
    {
      "results": [
        {
          "status": "answered",
          "linear_comment_id": "112c4314-3041-45b7-9158-f6fb675df138",
          "opened_at": "2026-09-16T09:17:13.394Z",
          "answer_actor_id": "8efc07d8-0d85-430f-84e7-f51bc6833a0b",
          "answer_comment_id": "8899fb25-d368-420f-99c7-24e67c3065e6"
        }
      ],
      "success": true,
      "meta": {
        "served_by": "v3-prod",
        "served_by_region": "WEUR",
        "served_by_colo": "AMS",
        "served_by_primary": true,
        "timings": {
          "sql_duration_ms": 0.1741
        },
        "duration": 0.1741,
        "changes": 0,
        "last_row_id": 211,
        "changed_db": false,
        "size_after": 101531648,
        "rows_read": 4,
        "rows_written": 0,
        "total_attempts": 1
      }
    },
    {
      "results": [
        {
          "event_kind": "Comment.create",
          "state": "processed",
          "actor_type": "user",
          "actor_id": "8efc07d8-0d85-430f-84e7-f51bc6833a0b",
          "comment_id": "8899fb25-d368-420f-99c7-24e67c3065e6",
          "provider_time": "2026-09-16T09:20:42.615Z",
          "processed_at": "2026-09-16T09:21:02.755Z"
        }
      ],
      "success": true,
      "meta": {
        "served_by": "v3-prod",
        "served_by_region": "WEUR",
        "served_by_colo": "AMS",
        "served_by_primary": true,
        "timings": {
          "sql_duration_ms": 0.2537
        },
        "duration": 0.2537,
        "changes": 0,
        "last_row_id": 211,
        "changed_db": false,
        "size_after": 101531648,
        "rows_read": 11,
        "rows_written": 0,
        "total_attempts": 1
      }
    },
    {
      "results": [
        {
          "from_node": "implementation_failed",
          "to_node": "implementation_branch_write",
          "cause_type": "operator_retry",
          "actor_type": "operator",
          "occurred_at": "2026-09-16T09:16:57.439Z"
        },
        {
          "from_node": "implementation_branch_write",
          "to_node": "implementation_publication_question",
          "cause_type": "workflow",
          "actor_type": "workflow",
          "occurred_at": "2026-09-16T09:17:12.596Z"
        },
        {
          "from_node": "implementation_publication_question",
          "to_node": "implementation_publication_wait",
          "cause_type": "workflow",
          "actor_type": "workflow",
          "occurred_at": "2026-09-16T09:17:13.741Z"
        },
        {
          "from_node": "implementation_publication_wait",
          "to_node": "implementation_build",
          "cause_type": "linear_event",
          "actor_type": "user",
          "occurred_at": "2026-09-16T09:21:02.646Z"
        }
      ],
      "success": true,
      "meta": {
        "served_by": "v3-prod",
        "served_by_region": "WEUR",
        "served_by_colo": "AMS",
        "served_by_primary": true,
        "timings": {
          "sql_duration_ms": 0.1665
        },
        "duration": 0.1665,
        "changes": 0,
        "last_row_id": 211,
        "changed_db": false,
        "size_after": 101531648,
        "rows_read": 5,
        "rows_written": 0,
        "total_attempts": 1
      }
    },
    {
      "results": [
        {
          "node_id": "implementation_build",
          "state": "running",
          "started_at": "2026-09-16T09:21:06.495Z",
          "ended_at": null
        },
        {
          "node_id": "implementation_build",
          "state": "completed",
          "started_at": "2026-09-16T06:16:09.841Z",
          "ended_at": "2026-09-16T08:18:10.591Z"
        }
      ],
      "success": true,
      "meta": {
        "served_by": "v3-prod",
        "served_by_region": "WEUR",
        "served_by_colo": "AMS",
        "served_by_primary": true,
        "timings": {
          "sql_duration_ms": 1.6438
        },
        "duration": 1.6438,
        "changes": 0,
        "last_row_id": 211,
        "changed_db": false,
        "size_after": 101531648,
        "rows_read": 586,
        "rows_written": 0,
        "total_attempts": 1
      }
    },
    {
      "results": [
        {
          "current_node": "implementation_build",
          "status": "active",
          "definition_version": 36
        }
      ],
      "success": true,
      "meta": {
        "served_by": "v3-prod",
        "served_by_region": "WEUR",
        "served_by_colo": "AMS",
        "served_by_primary": true,
        "timings": {
          "sql_duration_ms": 0.0981
        },
        "duration": 0.0981,
        "changes": 0,
        "last_row_id": 211,
        "changed_db": false,
        "size_after": 101531648,
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
rtk proxy python3 /tmp/sac225-publication-final-proof.py
```

```output
{
  "retry": [
    {
      "retry_kind": "compatible_tail",
      "state": "established",
      "source_definition_version": 33,
      "target_definition_version": 36,
      "retry_node": "implementation_branch_write",
      "created_at": "2026-09-16T09:16:57.439Z",
      "established_at": "2026-09-16T09:16:59.876Z"
    }
  ],
  "question": [
    {
      "status": "closed",
      "linear_comment_id": "112c4314-3041-45b7-9158-f6fb675df138",
      "opened_at": "2026-09-16T09:17:13.394Z",
      "answer_actor_id": "8efc07d8-0d85-430f-84e7-f51bc6833a0b",
      "answer_comment_id": "8899fb25-d368-420f-99c7-24e67c3065e6"
    }
  ],
  "replyDelivery": [
    {
      "event_kind": "Comment.create",
      "state": "processed",
      "actor_type": "user",
      "actor_id": "8efc07d8-0d85-430f-84e7-f51bc6833a0b",
      "comment_id": "8899fb25-d368-420f-99c7-24e67c3065e6",
      "provider_time": "2026-09-16T09:20:42.615Z",
      "processed_at": "2026-09-16T09:21:02.755Z"
    }
  ],
  "transitions": [
    {
      "from_node": "implementation_failed",
      "to_node": "implementation_branch_write",
      "cause_type": "operator_retry",
      "actor_type": "operator",
      "occurred_at": "2026-09-16T09:16:57.439Z"
    },
    {
      "from_node": "implementation_branch_write",
      "to_node": "implementation_publication_question",
      "cause_type": "workflow",
      "actor_type": "workflow",
      "occurred_at": "2026-09-16T09:17:12.596Z"
    },
    {
      "from_node": "implementation_publication_question",
      "to_node": "implementation_publication_wait",
      "cause_type": "workflow",
      "actor_type": "workflow",
      "occurred_at": "2026-09-16T09:17:13.741Z"
    },
    {
      "from_node": "implementation_publication_wait",
      "to_node": "implementation_build",
      "cause_type": "linear_event",
      "actor_type": "user",
      "occurred_at": "2026-09-16T09:21:02.646Z"
    },
    {
      "from_node": "implementation_build",
      "to_node": "implementation_proof_check",
      "cause_type": "agent",
      "actor_type": "agent",
      "occurred_at": "2026-09-16T09:28:56.744Z"
    },
    {
      "from_node": "implementation_proof_check",
      "to_node": "implementation_branch_write",
      "cause_type": "workflow",
      "actor_type": "workflow",
      "occurred_at": "2026-09-16T09:28:57.406Z"
    },
    {
      "from_node": "implementation_branch_write",
      "to_node": "implementation_publish",
      "cause_type": "workflow",
      "actor_type": "workflow",
      "occurred_at": "2026-09-16T09:29:11.740Z"
    },
    {
      "from_node": "implementation_publish",
      "to_node": "implementation_review",
      "cause_type": "workflow",
      "actor_type": "workflow",
      "occurred_at": "2026-09-16T09:29:21.468Z"
    }
  ],
  "authors": [
    {
      "node_id": "implementation_build",
      "state": "completed",
      "started_at": "2026-09-16T09:21:06.495Z",
      "ended_at": "2026-09-16T09:28:55.744Z"
    },
    {
      "node_id": "implementation_build",
      "state": "completed",
      "started_at": "2026-09-16T06:16:09.841Z",
      "ended_at": "2026-09-16T08:18:10.591Z"
    }
  ],
  "run": [
    {
      "current_node": "implementation_review",
      "status": "awaiting_human",
      "definition_version": 36
    }
  ]
}
{
  "pr": {
    "url": "https://github.com/sachinkundu/deos-sample-project/pull/33",
    "state": "OPEN",
    "isDraft": false,
    "headRefOid": "72c46f9f2a3027600289cb60911e2857a08ee688",
    "mergedAt": null
  },
  "changedFiles": 17,
  "actionsFiles": [],
  "claudeFindingsIncluded": true,
  "solResponseIncluded": true,
  "failedAuditRecorded": true
}
```

```bash
rtk proxy python3 /tmp/sac182-d1-read.py /tmp/sac225-publication-future-route-query.json
```

```output
{
  "result": [
    {
      "results": [
        {
          "project_id": "99426d9b-cda7-4db4-9136-692a95a0b090",
          "definition_id": "implementation",
          "definition_version": 35,
          "route_revision": 21,
          "workflow_revision": 14,
          "dispatch_enabled": 1,
          "allowed_linear_user_id": "8efc07d8-0d85-430f-84e7-f51bc6833a0b"
        }
      ],
      "success": true,
      "meta": {
        "served_by": "v3-prod",
        "served_by_region": "WEUR",
        "served_by_colo": "AMS",
        "served_by_primary": true,
        "timings": {
          "sql_duration_ms": 1.814
        },
        "duration": 1.814,
        "changes": 0,
        "last_row_id": 0,
        "changed_db": false,
        "size_after": 101584896,
        "rows_read": 3,
        "rows_written": 0,
        "total_attempts": 1
      }
    },
    {
      "results": [
        {
          "current_node": "implementation_review",
          "current_visit_sequence": 55,
          "status": "awaiting_human",
          "definition_version": 36,
          "definition_digest": "ebb46d0ee6c44446441250ed50d7d299a5c6303d6e773143e632b484d322bcfb",
          "workflow_instance_id": "wf-v1-df45egskeqygyufuef6i3jg2yjxrknkxfjhevma524j7ucsebyia"
        }
      ],
      "success": true,
      "meta": {
        "served_by": "v3-prod",
        "served_by_region": "WEUR",
        "served_by_colo": "AMS",
        "served_by_primary": true,
        "timings": {
          "sql_duration_ms": 0.6757
        },
        "duration": 0.6757,
        "changes": 0,
        "last_row_id": 0,
        "changed_db": false,
        "size_after": 101584896,
        "rows_read": 91,
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
