# SAC-182 runtime repair and trusted recovery

*2026-09-15T07:36:34Z by Showboat 0.6.1*
<!-- showboat-id: 3993d542-b0e1-4fad-970f-ebb2082c7aa1 -->

```bash
rtk proxy python3 scripts/sac-172/rollout-status.py --env-file /Users/sachin/code/deos/.env > /tmp/sac182-runtime-showboat.json
rtk proxy python3 scripts/sac-172/compact-status.py /tmp/sac182-runtime-showboat.json

```

```output
{
  "deployments": {
    "deos-queue-consumer-ts": {
      "versions": [
        {
          "version_id": "42f23c49-92fa-486a-82ed-df1c998fac48",
          "percentage": 100
        }
      ],
      "created_on": "2026-09-15T07:34:37.159615Z"
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
          "version_id": "0cd564c5-f900-4825-8c14-58ed565c01b6",
          "percentage": 100
        }
      ],
      "created_on": "2026-09-15T05:35:16.178051Z"
    }
  },
  "containers": [
    {
      "name": "deos-queue-consumer-ts-implementationstandard2sandbox",
      "image": "registry.cloudflare.com/c68856288112af7698f5be52ea94b96e/deos-queue-consumer-ts-implementationstandard2sandbox@sha256:aa12c51bcffed14041107eba5314f1130a78e9cbdd1547f97f726a862f366d2a",
      "version": 8,
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
      "image": "registry.cloudflare.com/c68856288112af7698f5be52ea94b96e/deos-queue-consumer-ts-implementationsandbox@sha256:aa12c51bcffed14041107eba5314f1130a78e9cbdd1547f97f726a862f366d2a",
      "version": 8,
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
  ],
  "run": [
    {
      "status": "active",
      "current_node": "implementation_build",
      "current_visit_sequence": 44,
      "definition_id": "implementation",
      "definition_version": 27,
      "definition_digest": "ad7fec5d557145b5dc8332c1a514a3ff9f3597fd3feee23f9f8e77e526b22f1c",
      "workflow_instance_id": "wf-v1-k5kuq3ggfmfrxcucpwfvopkstvcdnqanxvef7bv6c26zdp7enojq",
      "allowed_linear_user_id": "8efc07d8-0d85-430f-84e7-f51bc6833a0b",
      "human_binding_revision": 1,
      "sandbox_tier": "basic"
    }
  ],
  "latest_attempt": [
    {
      "attempt_id": "01a0a3ac-5d69-7e50-a1dd-9b883fe21acc",
      "node_id": "implementation_build",
      "visit_sequence": 42,
      "state": "interrupted",
      "sandbox_id": "impl-v1-p4sefyfadjr6sqzjzi4r3v4ri555sahrbrh5lv2quex64qtkheva",
      "sandbox_tier": "basic",
      "heartbeat_at": "2026-09-15T06:31:48.519Z",
      "process_id": "354b62e1-3073-4996-9286-be5f437b84dd",
      "result_class": "heartbeat_expired",
      "cleanup_state": "destroyed",
      "created_at": "2026-09-15T06:06:17.449Z",
      "ended_at": "2026-09-15T06:42:17.218Z"
    }
  ],
  "latest_try": [
    {
      "attempt_id": "01a0a3ac-5d69-7e50-a1dd-9b883fe21acc",
      "try_sequence": 7,
      "kind": "build",
      "status": "interrupted",
      "input_patch_sha": "81a3f091107316c8f7d8289aca9d28074e67f81671e1503977007d3527e215c7",
      "output_patch_sha": null,
      "public_error_code": null,
      "updated_at": "2026-09-15T06:42:24.883Z"
    }
  ],
  "recovered_input": [
    {
      "attempt_id": "01a0a3ac-5d69-7e50-a1dd-9b883fe21acc",
      "retry_source": "01a0a335-573b-7020-8d70-5e4eb7ec1ba7",
      "input_patch_sha": "81a3f091107316c8f7d8289aca9d28074e67f81671e1503977007d3527e215c7",
      "recovered_attempt": "01a0a335-573b-7020-8d70-5e4eb7ec1ba7"
    }
  ],
  "resource_recoveries": [
    {
      "failed_attempt_id": "01a0a3ac-5d69-7e50-a1dd-9b883fe21acc",
      "to_visit_sequence": 44,
      "requested_by": "sachin",
      "source_sandbox_tier": "basic",
      "target_sandbox_tier": "standard-2"
    }
  ],
  "progress": [
    {
      "attempt_id": "01a0a3ac-5d69-7e50-a1dd-9b883fe21acc",
      "completed": 50,
      "total": 50,
      "tasks_sha": "e3d8995d02952aa86940a51decfd82637864e4706b2d39164a1437c189727ebc",
      "observed_at": "2026-09-15T06:32:05.134Z"
    }
  ],
  "implementation": [
    {
      "status": "clarification",
      "approved_design_sha": "f2b994131d879967940e69ced07932dfffb8bc9a",
      "tested_base_sha": "f2b994131d879967940e69ced07932dfffb8bc9a",
      "branch": "deos/agent/SAC-182/run-1",
      "tree_sha": "e0ac2d18e079a390c1de14baaacedc201aec2335",
      "pr_url": null
    }
  ]
}
```

```bash
rtk proxy python3 scripts/sac-172/rollout-status.py --env-file /Users/sachin/code/deos/.env > /tmp/sac182-runtime-showboat.json
rtk proxy python3 scripts/sac-172/compact-status.py /tmp/sac182-runtime-showboat.json

```

```output
{
  "deployments": {
    "deos-queue-consumer-ts": {
      "versions": [
        {
          "version_id": "42f23c49-92fa-486a-82ed-df1c998fac48",
          "percentage": 100
        }
      ],
      "created_on": "2026-09-15T07:34:37.159615Z"
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
          "version_id": "10c033eb-fcf6-4825-93b4-f8bff4e6292f",
          "percentage": 100
        }
      ],
      "created_on": "2026-09-15T07:53:26.533814Z"
    }
  },
  "containers": [
    {
      "name": "deos-queue-consumer-ts-implementationstandard2sandbox",
      "image": "registry.cloudflare.com/c68856288112af7698f5be52ea94b96e/deos-queue-consumer-ts-implementationstandard2sandbox@sha256:aa12c51bcffed14041107eba5314f1130a78e9cbdd1547f97f726a862f366d2a",
      "version": 8,
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
      "name": "deos-queue-consumer-ts-implementationsandbox",
      "image": "registry.cloudflare.com/c68856288112af7698f5be52ea94b96e/deos-queue-consumer-ts-implementationsandbox@sha256:aa12c51bcffed14041107eba5314f1130a78e9cbdd1547f97f726a862f366d2a",
      "version": 8,
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
  ],
  "run": [
    {
      "status": "active",
      "current_node": "implementation_build",
      "current_visit_sequence": 44,
      "definition_id": "implementation",
      "definition_version": 27,
      "definition_digest": "ad7fec5d557145b5dc8332c1a514a3ff9f3597fd3feee23f9f8e77e526b22f1c",
      "workflow_instance_id": "wf-v1-k5kuq3ggfmfrxcucpwfvopkstvcdnqanxvef7bv6c26zdp7enojq",
      "allowed_linear_user_id": "8efc07d8-0d85-430f-84e7-f51bc6833a0b",
      "human_binding_revision": 1,
      "sandbox_tier": "basic"
    }
  ],
  "latest_attempt": [
    {
      "attempt_id": "01a0a407-62dc-7bc0-95e6-965a0a818188",
      "node_id": "implementation_build",
      "visit_sequence": 44,
      "state": "running",
      "sandbox_id": "impl-v1-tfqmguac4oelhcdyymct2uojh435fpeodiz3uqdpu5wp65efvyiq",
      "sandbox_tier": "standard-2",
      "heartbeat_at": "2026-09-15T07:51:06.292Z",
      "process_id": "a5a9f821-39c3-4476-bf2d-c894b85c58f5",
      "result_class": null,
      "cleanup_state": "pending",
      "created_at": "2026-09-15T07:45:42.620Z",
      "ended_at": null
    }
  ],
  "latest_try": [
    {
      "attempt_id": "01a0a407-62dc-7bc0-95e6-965a0a818188",
      "try_sequence": 8,
      "kind": "build",
      "status": "running",
      "input_patch_sha": "cdfaa685ebdf676271f2a26f6f8f0288953c054b6837176811325f735973b87f",
      "output_patch_sha": null,
      "public_error_code": null,
      "updated_at": "2026-09-15T07:45:57.403Z"
    }
  ],
  "recovered_input": [
    {
      "attempt_id": "01a0a407-62dc-7bc0-95e6-965a0a818188",
      "retry_source": "01a0a3ac-5d69-7e50-a1dd-9b883fe21acc",
      "input_patch_sha": "cdfaa685ebdf676271f2a26f6f8f0288953c054b6837176811325f735973b87f",
      "recovered_attempt": "01a0a3ac-5d69-7e50-a1dd-9b883fe21acc"
    }
  ],
  "resource_recoveries": [
    {
      "failed_attempt_id": "01a0a3ac-5d69-7e50-a1dd-9b883fe21acc",
      "to_visit_sequence": 44,
      "requested_by": "sachin",
      "source_sandbox_tier": "basic",
      "target_sandbox_tier": "standard-2"
    }
  ],
  "progress": [
    {
      "attempt_id": "01a0a407-62dc-7bc0-95e6-965a0a818188",
      "completed": 50,
      "total": 50,
      "tasks_sha": "e3d8995d02952aa86940a51decfd82637864e4706b2d39164a1437c189727ebc",
      "observed_at": "2026-09-15T07:51:10.842Z"
    }
  ],
  "implementation": [
    {
      "status": "clarification",
      "approved_design_sha": "f2b994131d879967940e69ced07932dfffb8bc9a",
      "tested_base_sha": "f2b994131d879967940e69ced07932dfffb8bc9a",
      "branch": "deos/agent/SAC-182/run-1",
      "tree_sha": "e0ac2d18e079a390c1de14baaacedc201aec2335",
      "pr_url": null
    }
  ]
}
```
