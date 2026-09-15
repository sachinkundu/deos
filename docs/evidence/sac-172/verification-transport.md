# SAC-182 verification transport recovery and rollout

*2026-09-15T09:22:32Z by Showboat 0.6.1*
<!-- showboat-id: d5efc91d-64cc-4429-b57e-6b82554276c8 -->

```bash
rtk proxy cat docs/evidence/sac-172/verification-transport-container.json
rtk proxy tail -n 10 /tmp/sac182-verification-transport-suite.log
rtk proxy cat /tmp/sac182-verification-transport-typecheck.log /tmp/sac182-verification-transport-bindings.log /tmp/sac182-verification-transport-openspec.log

```

```output
{
  "proof": "local container with deterministic model and broker fixtures",
  "supervisorExit": 0,
  "agentProcesses": [
    {
      "pid": 62,
      "mode": "initial",
      "sessionId": "local-process-proof-session"
    },
    {
      "pid": 118,
      "mode": "resume",
      "sessionId": "local-process-proof-session"
    },
    {
      "pid": 178,
      "mode": "resume",
      "sessionId": "local-process-proof-session"
    }
  ],
  "verification": [
    {
      "ready": false,
      "code": "checks_incomplete",
      "message": "Required commands failed: 'node' 'check.cjs' (exit 1)"
    },
    {
      "ready": false,
      "code": "checks_incomplete",
      "message": "No recorded checks match the final candidate tree. Rerun required checks after the last repository edit."
    },
    {
      "ready": true
    }
  ],
  "finalTree": "2b5c00a5a0434b400e5219b09aa374bb71a85c33",
  "matchedPatchSha": "834fc8791ff92ecea49952a32d88b12017bc087f0c75e9f0c14b780cd64385fe",
  "finalChecks": [
    {
      "command": "'node' 'check.cjs'",
      "cwd": "/deos/workspace/repository",
      "exitCode": 0
    }
  ],
  "retainedCheckRecords": 4,
  "completionSignals": 1,
  "heartbeatDuringVerification": true,
  "verificationRequests": 4,
  "retainedTransportFailures": 1
}
✔ human approval is an explicit transition (0.121041ms)
✔ cancellation explicitly rejects a waiting workflow (0.072625ms)
ℹ tests 511
ℹ suites 0
ℹ pass 511
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 8136.501542

> typecheck
> tsc --noEmit


> types:check
> wrangler types worker-configuration.d.ts --include-runtime false --config wrangler.queue-consumer-ts.jsonc --check


 ⛅️ wrangler 4.125.0 (update available 4.131.2)
───────────────────────────────────────────────
✨ Types at worker-configuration.d.ts are up to date.

Change 'sac-172' is valid
```

```bash
rtk proxy docker run --rm --platform linux/amd64 --entrypoint node --mount type=bind,source=/Users/sachin/code/deos-sac-172,target=/proof,readonly registry.cloudflare.com/c68856288112af7698f5be52ea94b96e/deos-queue-consumer-ts-implementationstandard2sandbox@sha256:8156a85e4c497fc55a23eb9a488cf61cbb4db0258e1b5c5019afae10256e2ebe --experimental-strip-types /proof/scripts/sac-172/verification-repair-proof.mjs

```

```output
{
  "proof": "local container with deterministic model and broker fixtures",
  "supervisorExit": 0,
  "agentProcesses": [
    {
      "pid": 63,
      "mode": "initial",
      "sessionId": "local-process-proof-session"
    },
    {
      "pid": 119,
      "mode": "resume",
      "sessionId": "local-process-proof-session"
    },
    {
      "pid": 179,
      "mode": "resume",
      "sessionId": "local-process-proof-session"
    }
  ],
  "verification": [
    {
      "ready": false,
      "code": "checks_incomplete",
      "message": "Required commands failed: 'node' 'check.cjs' (exit 1)"
    },
    {
      "ready": false,
      "code": "checks_incomplete",
      "message": "No recorded checks match the final candidate tree. Rerun required checks after the last repository edit."
    },
    {
      "ready": true
    }
  ],
  "finalTree": "2b5c00a5a0434b400e5219b09aa374bb71a85c33",
  "matchedPatchSha": "834fc8791ff92ecea49952a32d88b12017bc087f0c75e9f0c14b780cd64385fe",
  "finalChecks": [
    {
      "command": "'node' 'check.cjs'",
      "cwd": "/deos/workspace/repository",
      "exitCode": 0
    }
  ],
  "retainedCheckRecords": 4,
  "completionSignals": 1,
  "heartbeatDuringVerification": true,
  "verificationRequests": 4,
  "retainedTransportFailures": 1
}
```

```bash
rtk proxy python3 /tmp/sac182-operator.py stage-retries /tmp/sac182-try9-safe-retry-request.json

```

```output
{
  "retry": {
    "retry_id": "stage-retry:01a0a436-6328-7de2-bdfe-67b82f4cfcb2",
    "run_id": "workflow:2a653831-c1ec-4db7-972a-d0d08ac0a3d8:e75aad25-c32f-4c23-8184-b4b38388a631:run:1",
    "failed_attempt_id": "01a0a436-6328-7de2-bdfe-67b82f4cfcb2",
    "retry_node": "implementation_build",
    "from_visit_sequence": 50,
    "to_visit_sequence": 51,
    "transition_id": "transition:stage-retry:01a0a436-6328-7de2-bdfe-67b82f4cfcb2",
    "state": "established",
    "workflow_status": "queued",
    "safe_error_category": null,
    "requested_by": "sachin",
    "created_at": "2026-09-15T09:28:58.927Z",
    "updated_at": "2026-09-15T09:29:00.861Z",
    "established_at": "2026-09-15T09:29:00.861Z",
    "retry_kind": "same_definition",
    "source_definition_id": "implementation",
    "source_definition_version": 27,
    "source_definition_digest": "ad7fec5d557145b5dc8332c1a514a3ff9f3597fd3feee23f9f8e77e526b22f1c",
    "target_definition_id": "implementation",
    "target_definition_version": 27,
    "target_definition_digest": "ad7fec5d557145b5dc8332c1a514a3ff9f3597fd3feee23f9f8e77e526b22f1c",
    "source_workflow_instance_id": "wf-v1-k5kuq3ggfmfrxcucpwfvopkstvcdnqanxvef7bv6c26zdp7enojq",
    "target_workflow_instance_id": "wf-v1-qwhdbzjc2u7lfo4ym52ytbw432zx5s45p36e6pj5quenjk3b6gyq",
    "source_delivery_id": "af60cf6e-d451-4a98-86ec-6aa23f47e047",
    "source_sandbox_tier": "standard-2",
    "target_sandbox_tier": "standard-2",
    "workflow_instance_id": "wf-v1-qwhdbzjc2u7lfo4ym52ytbw432zx5s45p36e6pj5quenjk3b6gyq"
  }
}
```

```bash
rtk proxy python3 scripts/sac-172/rollout-status.py --env-file /Users/sachin/code/deos/.env > /tmp/sac182-verification-transport-resumed.json
rtk proxy python3 scripts/sac-172/compact-status.py /tmp/sac182-verification-transport-resumed.json
rtk proxy python3 /tmp/sac182-d1-read.py /tmp/sac182-try10-feedback-query.json

```

```output
{
  "deployments": {
    "deos-queue-consumer-ts": {
      "versions": [
        {
          "version_id": "f5c50a51-f44f-4936-8b93-20c56ebf440e",
          "percentage": 100
        }
      ],
      "created_on": "2026-09-15T09:21:19.000561Z"
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
      "image": "registry.cloudflare.com/c68856288112af7698f5be52ea94b96e/deos-queue-consumer-ts-implementationstandard2sandbox@sha256:8156a85e4c497fc55a23eb9a488cf61cbb4db0258e1b5c5019afae10256e2ebe",
      "version": 9,
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
      "image": "registry.cloudflare.com/c68856288112af7698f5be52ea94b96e/deos-queue-consumer-ts-implementationsandbox@sha256:8156a85e4c497fc55a23eb9a488cf61cbb4db0258e1b5c5019afae10256e2ebe",
      "version": 9,
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
      "current_visit_sequence": 51,
      "definition_id": "implementation",
      "definition_version": 27,
      "definition_digest": "ad7fec5d557145b5dc8332c1a514a3ff9f3597fd3feee23f9f8e77e526b22f1c",
      "workflow_instance_id": "wf-v1-qwhdbzjc2u7lfo4ym52ytbw432zx5s45p36e6pj5quenjk3b6gyq",
      "allowed_linear_user_id": "8efc07d8-0d85-430f-84e7-f51bc6833a0b",
      "human_binding_revision": 1,
      "sandbox_tier": "basic"
    }
  ],
  "latest_attempt": [
    {
      "attempt_id": "01a0a466-1267-734d-9ac7-59120044a1b4",
      "node_id": "implementation_build",
      "visit_sequence": 51,
      "state": "running",
      "sandbox_id": "impl-v1-dv5tocnjwsy2jfnymdev4nep3kn4acgbhrf3hkfd3wkcf6lu7bwq",
      "sandbox_tier": "standard-2",
      "heartbeat_at": "2026-09-15T09:29:24.864Z",
      "process_id": "3a5f1042-5895-456e-90c9-2610ae550cb3",
      "result_class": null,
      "cleanup_state": "pending",
      "created_at": "2026-09-15T09:29:07.943Z",
      "ended_at": null
    }
  ],
  "latest_try": [
    {
      "attempt_id": "01a0a466-1267-734d-9ac7-59120044a1b4",
      "try_sequence": 10,
      "kind": "build",
      "status": "running",
      "input_patch_sha": "8a6ff3e0c147a0558a72723d084ac063251d0934935af4632921a9097ab77896",
      "output_patch_sha": null,
      "public_error_code": null,
      "updated_at": "2026-09-15T09:29:21.304Z"
    }
  ],
  "recovered_input": [
    {
      "attempt_id": "01a0a466-1267-734d-9ac7-59120044a1b4",
      "retry_source": "01a0a436-6328-7de2-bdfe-67b82f4cfcb2",
      "input_patch_sha": "8a6ff3e0c147a0558a72723d084ac063251d0934935af4632921a9097ab77896",
      "recovered_attempt": "01a0a436-6328-7de2-bdfe-67b82f4cfcb2"
    }
  ],
  "resource_recoveries": [
    {
      "failed_attempt_id": "01a0a436-6328-7de2-bdfe-67b82f4cfcb2",
      "to_visit_sequence": 51,
      "requested_by": "sachin",
      "source_sandbox_tier": "standard-2",
      "target_sandbox_tier": "standard-2"
    },
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
      "attempt_id": "01a0a466-1267-734d-9ac7-59120044a1b4",
      "completed": 50,
      "total": 50,
      "tasks_sha": "e3d8995d02952aa86940a51decfd82637864e4706b2d39164a1437c189727ebc",
      "observed_at": "2026-09-15T09:29:27.919Z"
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
{
  "result": [
    {
      "results": [
        {
          "attempt_id": "01a0a466-1267-734d-9ac7-59120044a1b4",
          "visit_sequence": 51,
          "state": "running",
          "sandbox_tier": "standard-2",
          "heartbeat_at": "2026-09-15T09:29:24.864Z",
          "input_patch_sha": "8a6ff3e0c147a0558a72723d084ac063251d0934935af4632921a9097ab77896",
          "review_feedback": "{\"trust\":\"untrusted provider data\",\"reviews\":[],\"comments\":[],\"discussionComments\":[{\"url\":\"https://api.github.com/repos/sachinkundu/deos/issues/comments/5677258210\",\"html_url\":\"https://github.com/sachinkundu/deos/pull/137#issuecomment-5677258210\",\"issue_url\":\"https://api.github.com/repos/sachinkundu/deos/issues/137\",\"id\":5677258210,\"node_id\":\"IC_kwDOT1GOUM8AAAABUmQV4g\",\"user\":{\"login\":\"sachinkundu\",\"id\":233623,\"node_id\":\"MDQ6VXNlcjIzMzYyMw==\",\"avatar_url\":\"https://avatars.githubusercontent.com/u/233623?v=4\",\"gravatar_id\":\"\",\"url\":\"https://api.github.com/users/sachinkundu\",\"html_url\":\"https://github.com/sachinkundu\",\"followers_url\":\"https://api.github.com/users/sachinkundu/followers\",\"following_url\":\"https://api.github.com/users/sachinkundu/following{/other_user}\",\"gists_url\":\"https://api.github.com/users/sachinkundu/gists{/gist_id}\",\"starred_url\":\"https://api.github.com/users/sachinkundu/starred{/owner}{/repo}\",\"subscriptions_url\":\"https://api.github.com/users/sachinkundu/subscriptions\",\"organizations_url\":\"https://api.github.com/users/sachinkundu/orgs\",\"repos_url\":\"https://api.github.com/users/sachinkundu/repos\",\"events_url\":\"https://api.github.com/users/sachinkundu/events{/privacy}\",\"received_events_url\":\"https://api.github.com/users/sachinkundu/received_events\",\"type\":\"User\",\"user_view_type\":\"public\",\"site_admin\":false},\"created_at\":\"2026-09-15T08:37:43Z\",\"updated_at\":\"2026-09-15T08:37:43Z\",\"body\":\"Two acceptance gaps remain:\\n\\n* The settings screenshot shows an authentication error.\\n* The provider demo substitutes a stub for the real continuation service.\",\"author_association\":\"OWNER\",\"reactions\":{\"url\":\"https://api.github.com/repos/sachinkundu/deos/issues/comments/5677258210/reactions\",\"total_count\":0,\"+1\":0,\"-1\":0,\"laugh\":0,\"hooray\":0,\"confused\":0,\"heart\":0,\"rocket\":0,\"eyes\":0},\"performed_via_github_app\":null,\"minimized\":null}]}"
        }
      ],
      "success": true,
      "meta": {
        "served_by": "v3-prod",
        "served_by_region": "WEUR",
        "served_by_colo": "AMS",
        "served_by_primary": true,
        "timings": {
          "sql_duration_ms": 4.1563
        },
        "duration": 4.1563,
        "changes": 0,
        "last_row_id": 8,
        "changed_db": false,
        "size_after": 94351360,
        "rows_read": 542,
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
