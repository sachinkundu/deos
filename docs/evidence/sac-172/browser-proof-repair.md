# SAC-182 PR handoff and browser proof repair

*2026-09-15T08:23:42Z by Showboat 0.6.1*
<!-- showboat-id: def7afde-e44d-4cd4-b263-dc52bc57da6f -->

```bash
rtk proxy node --experimental-strip-types --test tests/implementation-browser.test.ts
rtk proxy python3 scripts/sac-172/rollout-status.py --env-file /Users/sachin/code/deos/.env > /tmp/sac182-browser-showboat-status.json
rtk proxy python3 scripts/sac-172/compact-status.py /tmp/sac182-browser-showboat-status.json

```

```output
✔ browser capacity waits without allocation; one browser is reused within only its own try (100.606917ms)
✔ reconciliation refreshes only the active try's existing browser and throttles repeat observations (89.074542ms)
✔ provider maintenance avoids connected sessions, detects expiry and disconnects after an actual command (0.451333ms)
✔ a real navigation status follows the browser across commands and failed documents cannot become visual proof (0.483ms)
✔ lost allocation response quarantines this try and never creates a replacement browser (90.270292ms)
ℹ tests 5
ℹ suites 0
ℹ pass 5
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 424.911042
{
  "deployments": {
    "deos-queue-consumer-ts": {
      "versions": [
        {
          "version_id": "fd80b204-d504-47e2-85e6-cfec5f67688d",
          "percentage": 100
        }
      ],
      "created_on": "2026-09-15T08:21:15.748911Z"
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
      "status": "awaiting_human",
      "current_node": "implementation_review",
      "current_visit_sequence": 48,
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
      "state": "completed",
      "sandbox_id": "impl-v1-tfqmguac4oelhcdyymct2uojh435fpeodiz3uqdpu5wp65efvyiq",
      "sandbox_tier": "standard-2",
      "heartbeat_at": "2026-09-15T08:11:06.584Z",
      "process_id": "a5a9f821-39c3-4476-bf2d-c894b85c58f5",
      "result_class": "completed",
      "cleanup_state": "destroyed",
      "created_at": "2026-09-15T07:45:42.620Z",
      "ended_at": "2026-09-15T08:13:08.763Z"
    }
  ],
  "latest_try": [
    {
      "attempt_id": "01a0a407-62dc-7bc0-95e6-965a0a818188",
      "try_sequence": 8,
      "kind": "build",
      "status": "completed",
      "input_patch_sha": "cdfaa685ebdf676271f2a26f6f8f0288953c054b6837176811325f735973b87f",
      "output_patch_sha": "8a6ff3e0c147a0558a72723d084ac063251d0934935af4632921a9097ab77896",
      "public_error_code": "implementation_failed",
      "updated_at": "2026-09-15T08:13:08.610Z"
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
      "observed_at": "2026-09-15T08:11:23.507Z"
    }
  ],
  "implementation": [
    {
      "status": "review",
      "approved_design_sha": "f2b994131d879967940e69ced07932dfffb8bc9a",
      "tested_base_sha": "f2b994131d879967940e69ced07932dfffb8bc9a",
      "branch": "deos/agent/SAC-182/run-1",
      "tree_sha": "7923143c6f795f30d396e715895f3aae87ed96e9",
      "pr_url": "https://github.com/sachinkundu/deos/pull/137"
    }
  ]
}
```
