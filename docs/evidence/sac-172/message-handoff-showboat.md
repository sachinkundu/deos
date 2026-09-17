# SAC-172 message handoff deployment

*2026-09-16T08:29:00Z by Showboat 0.6.1*
<!-- showboat-id: 32cd5e53-8b1e-4e09-a11b-40b335ea09ea -->

```bash
rtk proxy python3 /tmp/sac182-cf-read.py workers/scripts/deos-queue-consumer-ts/deployments /tmp/sac172-handoff-backend-deployments.json | python3 -c "import json,sys; d=json.load(sys.stdin); assert d[\"success\"]; print(json.dumps(d[\"result\"][\"deployments\"][0],indent=2))"
```

```output
{
  "id": "eb0955aa-c871-4d1f-abdb-40fc119447de",
  "source": "wrangler",
  "strategy": "percentage",
  "author_email": "sachin.kundu@pm.me",
  "annotations": {
    "workers/message": "Automatic deployment on upload.",
    "workers/triggered_by": "upload"
  },
  "versions": [
    {
      "version_id": "a875db5d-aa0e-4dac-a3b7-f63d6637bde7",
      "percentage": 100
    }
  ],
  "created_on": "2026-09-16T08:29:32.346887Z"
}
```

```bash
rtk proxy python3 /tmp/sac182-cf-read.py workers/scripts/deos-workflow-portal-staging/deployments /tmp/sac172-handoff-portal-deployments.json | python3 -c "import json,sys; d=json.load(sys.stdin); assert d[\"success\"]; print(json.dumps(d[\"result\"][\"deployments\"][0],indent=2))"
```

```output
{
  "id": "ee059a47-5a3b-46af-8b93-687bc174a305",
  "source": "wrangler",
  "strategy": "percentage",
  "author_email": "sachin.kundu@pm.me",
  "annotations": {
    "workers/triggered_by": "deployment"
  },
  "versions": [
    {
      "version_id": "4515b0d5-b338-4960-aedf-b5db4bfd1df9",
      "percentage": 100
    }
  ],
  "created_on": "2026-09-16T08:29:53.965887Z"
}
```

```bash
rtk proxy python3 /tmp/sac172-handoff-rollout.py --env-file /Users/sachin/code/deos/.env
```

```output
{
  "deployments": {
    "deos-queue-consumer-ts": {
      "versions": [
        {
          "version_id": "a875db5d-aa0e-4dac-a3b7-f63d6637bde7",
          "percentage": 100
        }
      ],
      "created_on": "2026-09-16T08:29:32.346887Z"
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
          "version_id": "4515b0d5-b338-4960-aedf-b5db4bfd1df9",
          "percentage": 100
        }
      ],
      "created_on": "2026-09-16T08:29:53.965887Z"
    }
  },
  "containers": [
    {
      "name": "deos-queue-consumer-ts-implementationstandard2sandbox",
      "image": "registry.cloudflare.com/c68856288112af7698f5be52ea94b96e/deos-queue-consumer-ts-implementationstandard2sandbox@sha256:6d185a73e2625dbd3229f15198ad71f3fea26355e14ab8c0af2295f71c1d61ac",
      "version": 17,
      "rollout": "progressing",
      "health": {
        "errors": [],
        "instances": {
          "active": 0,
          "assigned": 0,
          "healthy": 3,
          "stopped": 0,
          "failed": 0,
          "scheduling": 1,
          "starting": 0
        }
      },
      "progress": {
        "total_steps": 2,
        "current_step": 1,
        "updated_instances": 0,
        "total_instances": 4,
        "version_distribution": {
          "target_version_instances": 1,
          "current_version_instances": 3,
          "target_version_percentage": 25
        }
      }
    },
    {
      "name": "deos-queue-consumer-ts-implementationsandbox",
      "image": "registry.cloudflare.com/c68856288112af7698f5be52ea94b96e/deos-queue-consumer-ts-implementationsandbox@sha256:6d185a73e2625dbd3229f15198ad71f3fea26355e14ab8c0af2295f71c1d61ac",
      "version": 18,
      "rollout": "progressing",
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
      "progress": {
        "total_steps": 2,
        "current_step": 2,
        "updated_instances": 1,
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
      "image": "registry.cloudflare.com/c68856288112af7698f5be52ea94b96e/deos-queue-consumer-ts-standard2sandbox@sha256:6d185a73e2625dbd3229f15198ad71f3fea26355e14ab8c0af2295f71c1d61ac",
      "version": 24,
      "rollout": "progressing",
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
        "updated_instances": 1,
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
      "image": "registry.cloudflare.com/c68856288112af7698f5be52ea94b96e/deos-queue-consumer-ts-sandbox@sha256:6d185a73e2625dbd3229f15198ad71f3fea26355e14ab8c0af2295f71c1d61ac",
      "version": 81,
      "rollout": "progressing",
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
      "progress": {
        "total_steps": 2,
        "current_step": 2,
        "updated_instances": 1,
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
rtk proxy python3 /tmp/sac172-handoff-rollout.py --env-file /Users/sachin/code/deos/.env
```

```output
{
  "deployments": {
    "deos-queue-consumer-ts": {
      "versions": [
        {
          "version_id": "a875db5d-aa0e-4dac-a3b7-f63d6637bde7",
          "percentage": 100
        }
      ],
      "created_on": "2026-09-16T08:29:32.346887Z"
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
          "version_id": "e3294ce2-d29e-45c5-8bf4-ffe6220ce3e9",
          "percentage": 100
        }
      ],
      "created_on": "2026-09-16T08:35:37.32334Z"
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
      "name": "deos-queue-consumer-ts-standard2sandbox",
      "image": "registry.cloudflare.com/c68856288112af7698f5be52ea94b96e/deos-queue-consumer-ts-standard2sandbox@sha256:062e5dec9a2d502449a8ccddce62f718be94fc8e16cf5be2642cf308b6456445",
      "version": 25,
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
rtk proxy python3 /tmp/sac182-d1-read.py /tmp/sac225-publication-handoff-state.json
```

```output
{
  "result": [
    {
      "results": [
        {
          "run_id": "workflow:99426d9b-cda7-4db4-9136-692a95a0b090:d5dc0e9d-be0d-4504-82a1-62c14340c91c:run:1",
          "definition_version": 33,
          "current_node": "implementation_failed",
          "current_visit_sequence": 47,
          "status": "failed",
          "terminal_cause": "implementation_failed",
          "last_transition_id": "workflow:99426d9b-cda7-4db4-9136-692a95a0b090:d5dc0e9d-be0d-4504-82a1-62c14340c91c:run:1:visit:46:transition"
        }
      ],
      "success": true,
      "meta": {
        "served_by": "v3-prod",
        "served_by_region": "WEUR",
        "served_by_colo": "AMS",
        "served_by_primary": true,
        "timings": {
          "sql_duration_ms": 0.2373
        },
        "duration": 0.2373,
        "changes": 0,
        "last_row_id": 0,
        "changed_db": false,
        "size_after": 101023744,
        "rows_read": 1,
        "rows_written": 0,
        "total_attempts": 1
      }
    },
    {
      "results": [
        {
          "attempt_id": "01a0a8db-c2c4-7ff0-af66-31f66a82329e",
          "node_id": "implementation_build",
          "state": "completed",
          "ended_at": "2026-09-16T08:18:10.591Z"
        },
        {
          "attempt_id": "01a0a8b7-340b-727d-8db1-b4d1f2ef0287",
          "node_id": "implementation_build",
          "state": "failed",
          "ended_at": "2026-09-16T06:04:13.203Z"
        },
        {
          "attempt_id": "01a0a884-fcf0-7699-ac70-659be75e098d",
          "node_id": "implementation_demo_gate",
          "state": "failed",
          "ended_at": "2026-09-16T04:50:00.089Z"
        }
      ],
      "success": true,
      "meta": {
        "served_by": "v3-prod",
        "served_by_region": "WEUR",
        "served_by_colo": "AMS",
        "served_by_primary": true,
        "timings": {
          "sql_duration_ms": 1.6882
        },
        "duration": 1.6882,
        "changes": 0,
        "last_row_id": 0,
        "changed_db": false,
        "size_after": 101023744,
        "rows_read": 584,
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
rtk proxy python3 /tmp/sac172-handoff-rollout.py --env-file /Users/sachin/code/deos/.env
```

```output
{
  "deployments": {
    "deos-queue-consumer-ts": {
      "versions": [
        {
          "version_id": "77179dcf-0672-422a-b2cd-ab2d8a3af76f",
          "percentage": 100
        }
      ],
      "created_on": "2026-09-16T08:47:36.759771Z"
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
          "version_id": "1f6a3e3c-5761-4d50-8d5b-062c44c756f2",
          "percentage": 100
        }
      ],
      "created_on": "2026-09-16T08:49:09.758621Z"
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
      "name": "deos-queue-consumer-ts-standard2sandbox",
      "image": "registry.cloudflare.com/c68856288112af7698f5be52ea94b96e/deos-queue-consumer-ts-standard2sandbox@sha256:062e5dec9a2d502449a8ccddce62f718be94fc8e16cf5be2642cf308b6456445",
      "version": 25,
      "rollout": "progressing",
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
      "progress": {
        "total_steps": 2,
        "current_step": 2,
        "updated_instances": 1,
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
rtk proxy python3 /tmp/sac172-handoff-rollout.py --env-file /Users/sachin/code/deos/.env
```

```output
{
  "deployments": {
    "deos-queue-consumer-ts": {
      "versions": [
        {
          "version_id": "77179dcf-0672-422a-b2cd-ab2d8a3af76f",
          "percentage": 100
        }
      ],
      "created_on": "2026-09-16T08:47:36.759771Z"
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
          "version_id": "1f6a3e3c-5761-4d50-8d5b-062c44c756f2",
          "percentage": 100
        }
      ],
      "created_on": "2026-09-16T08:49:09.758621Z"
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
