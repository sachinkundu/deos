# SAC-172 independent review error preservation

*2026-09-13T10:56:59Z by Showboat 0.6.1*
<!-- showboat-id: bdbc3e4d-f7f0-487b-a580-674a3a3ff497 -->

```bash
rtk proxy python3 docs/evidence/independent-review-errors/readback.py --env-file /Users/sachin/code/deos/.env
```

```output
{
  "evidence": "live D1 and R2 readback of the original failed attempt",
  "issue": "SAC-172",
  "time": "2026-09-13T10:17:34.687Z",
  "message": "Claude runner stopped without a result or failure file",
  "detail": {
    "stack": "ClaudeReviewError: review_failure\n    at ClaudeRunner.status (queue-consumer.js:8306:29)\n    at async ClaudeRunner.handle (queue-consumer.js:8177:45)\n    at async queue-consumer.js:113:16",
    "message": "review_failure",
    "causeCode": "review_failure",
    "retryNotBefore": null,
    "name": "ClaudeReviewError",
    "diagnostic": {
      "providerMessage": "Claude runner stopped without a result or failure file",
      "processId": "eaeda186-2076-4406-8834-07c40de2283f",
      "output": {
        "stdout": "",
        "stderr": "",
        "exitCode": 1,
        "signal": {
          "type": "undefined"
        },
        "timedOut": false,
        "truncated": false
      }
    }
  }
}
```

The preceding entry is a live read of the original failed attempt. The following probe exercises the changed runner in a locally built image with networking disabled; it is not provider E2E evidence.

```bash
rtk proxy docker create --rm --name deos-independent-error-proof --platform linux/amd64 --network none --memory 1g --entrypoint node deos-review-errors:local /tmp/probe-image.mjs
rtk proxy docker cp docs/evidence/independent-review-errors/probe-image.mjs deos-independent-error-proof:/tmp/probe-image.mjs
rtk proxy docker start -a deos-independent-error-proof
```

```output
18835754caa40a91eb24e25cc0379e130e48d7bb776752ef7eb96d2d679b05b7
{
  "evidence": "local built image, real runner process, network disabled",
  "exitCode": 1,
  "cause": "Claude runner config.json is missing",
  "fileMatchesStderr": true,
  "originalStackRetained": true
}
```

```bash
rtk proxy python3 docs/evidence/independent-review-errors/recovery-readback.py --env-file /Users/sachin/code/deos/.env
```

```output
{
  "runs": [
    {
      "issue_id": "ec27e96b-1a1a-4f38-a4d1-070258a45ec0",
      "run_id": "workflow:2a653831-c1ec-4db7-972a-d0d08ac0a3d8:ec27e96b-1a1a-4f38-a4d1-070258a45ec0:run:1",
      "status": "active",
      "current_node": "planning_independent_response",
      "definition_version": 25,
      "updated_at": "2026-09-13T11:32:07.696Z"
    },
    {
      "issue_id": "401b2151-28a4-423c-b8a7-dd06859bba50",
      "run_id": "workflow:2a653831-c1ec-4db7-972a-d0d08ac0a3d8:401b2151-28a4-423c-b8a7-dd06859bba50:run:1",
      "status": "awaiting_human",
      "current_node": "planning_review",
      "definition_version": 25,
      "updated_at": "2026-09-13T11:27:21.285Z"
    }
  ],
  "attempts": [
    {
      "attempt_id": "01a09a34-b19e-7454-a47e-729906f7978a",
      "node_id": "planning_author",
      "state": "completed",
      "result_class": "completed",
      "cleanup_state": "destroyed"
    },
    {
      "attempt_id": "01a09a35-5e38-75ee-9120-6a517966baa0",
      "node_id": "planning_author",
      "state": "completed",
      "result_class": "completed",
      "cleanup_state": "destroyed"
    },
    {
      "attempt_id": "01a09a42-54e5-70d4-a08b-801e6b6d6841",
      "node_id": "independent_discovery",
      "state": "completed",
      "result_class": "pass",
      "cleanup_state": "destroyed"
    },
    {
      "attempt_id": "01a09a45-2026-7ea0-bc87-4607c458423e",
      "node_id": "independent_discovery",
      "state": "failed",
      "result_class": "codex_exit_nonzero",
      "cleanup_state": "destroyed"
    },
    {
      "attempt_id": "01a09a46-3ecb-7f3e-ba58-ee2ab7bd91e8",
      "node_id": "planning_independent_response",
      "state": "completed",
      "result_class": "completed",
      "cleanup_state": "destroyed"
    },
    {
      "attempt_id": "01a09a5a-813d-7bb5-b7d1-bebebd75f6b0",
      "node_id": "planning_revision_author",
      "state": "completed",
      "result_class": "completed",
      "cleanup_state": "destroyed"
    },
    {
      "attempt_id": "01a09a85-8c7d-755e-b893-199861bf75c9",
      "node_id": "independent_discovery",
      "state": "completed",
      "result_class": "pass",
      "cleanup_state": "destroyed"
    },
    {
      "attempt_id": "01a09a89-fc0a-7d06-b530-152b692209b3",
      "node_id": "planning_independent_response",
      "state": "running",
      "result_class": null,
      "cleanup_state": "pending"
    }
  ],
  "lateFeedbackReceipt": [
    {
      "state": "reconciled",
      "safe_error_category": "planning_review_feedback_deferred",
      "completed_at": "2026-09-13T11:27:05.163Z"
    }
  ],
  "deployment": {
    "id": "2feb3171-fb1f-46ff-8034-0dda52866680",
    "source": "wrangler",
    "strategy": "percentage",
    "author_email": "sachin.kundu@pm.me",
    "annotations": {
      "workers/message": "SAC-172 original review errors and SAC-181 late...",
      "workers/triggered_by": "upload"
    },
    "versions": [
      {
        "version_id": "d5829f3d-8293-43a8-ab93-f297fbe1847a",
        "percentage": 100
      }
    ],
    "created_on": "2026-09-13T11:22:55.815807Z"
  },
  "containers": [
    {
      "id": "a0344373-884d-4c06-b4c2-4e58295de498",
      "image": "registry.cloudflare.com/c68856288112af7698f5be52ea94b96e/deos-queue-consumer-ts-sandbox@sha256:c52ee12e7c297049a5da3b09bf436b6e4492ee31ea0ca11be87fdf433e9228bf",
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
      }
    },
    {
      "id": "a03d8a75-5574-4d37-806d-8b07ed1a79c6",
      "image": "registry.cloudflare.com/c68856288112af7698f5be52ea94b96e/deos-queue-consumer-ts-standard2sandbox@sha256:c52ee12e7c297049a5da3b09bf436b6e4492ee31ea0ca11be87fdf433e9228bf",
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
      }
    }
  ]
}
```

```bash
rtk proxy docker start -a deos-capture-verification
```

```output
TAP version 13
# Subtest: SIGKILL preserves the exact parent transcript for failure collection and replay
ok 1 - SIGKILL preserves the exact parent transcript for failure collection and replay
  ---
  duration_ms: 311.930138
  type: 'test'
  ...
1..1
# tests 1
# suites 0
# pass 1
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 327.408223
```

```bash
rtk proxy docker start -a deos-semantic-verification
```

```output
{
  "proof": "Replay of SAC-172 saved native recheck",
  "ratings": {
    "proof-base-drift": "fixed",
    "incomplete-lifecycle-graph": "fixed",
    "human-identity-enrollment": "fixed",
    "clarification-comment-readback": "fixed",
    "capability-policy-timing": "fixed",
    "test-resource-reconciliation": "fixed",
    "openspec-post-merge-tail": "fixed"
  },
  "source": {
    "id": "candidate-design",
    "url": "openspec/changes/sac-172/design.md",
    "title": "SAC-172 design candidate",
    "claimLocator": "proof-base-drift",
    "provenance": "local",
    "evidenceKind": "local_document"
  },
  "warnings": []
}
```
