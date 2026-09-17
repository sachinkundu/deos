# SAC-225 saved review recovery

*2026-09-15T18:32:57Z by Showboat 0.6.1*
<!-- showboat-id: 3748bf57-d5aa-4e01-a363-a6dc3cdc9d47 -->

This records operator-assisted recovery of an existing Claude review. The first command validates live D1, R2 and GitHub through a read-only adapter; it does not accept the review, invoke a model, or grant approval.

```bash
rtk proxy node --experimental-strip-types /tmp/sac225-receipt-preflight.ts
```

```output
{
  "ready": true,
  "proof": "Read-only validation against current D1, R2 and GitHub",
  "headSha": "f7d608cbed6e0bf6b88d9eb5c3eb38b4d04c9d22",
  "findings": [
    "awaiting-rhs-transition-underdetermined",
    "preview-deployment-mechanism-unspecified",
    "result-exponent-notation-unspecified",
    "unfinished-decimal-operand-normalization"
  ],
  "nextNode": "design_independent_response",
  "objectsRead": 5,
  "invalidCount": 2
}
```

```bash
rtk proxy python3 /tmp/sac225-recovery-readback.py
```

```output
{
  "proof": "Read-only remote D1 readback",
  "run": {
    "status": "active",
    "current_node": "design_independent_response",
    "current_visit_sequence": 21,
    "definition_version": 25,
    "workflow_instance_id": "wf-v1-e3gx5nyorpr4oof63br5mxg3kgdalmftohvsusg5j7i4srzmox2a"
  },
  "latestAttempt": {
    "attempt_id": "01a0a65b-fd30-712d-9d06-9a66762564e1",
    "node_id": "design_independent_response",
    "state": "running",
    "created_at": "2026-09-15T18:37:21.584Z",
    "ended_at": null
  },
  "audit": [
    {
      "reconciliation_id": "independent-receipt:01a0a60d-221c-72f4-88ed-b00c15115ade",
      "state": "established",
      "plan_digest": "0e6d9b02fdee5d8b2d22d31f16c7456690b3e71930c7f6f7fbd3f7e48bdbb8f6",
      "target_workflow_instance_id": "wf-v1-e3gx5nyorpr4oof63br5mxg3kgdalmftohvsusg5j7i4srzmox2a",
      "updated_at": "2026-09-15T18:37:16.330Z"
    }
  ],
  "cycle": [
    {
      "phase": "design",
      "revision": 6,
      "status": "active",
      "invalid_count": 2,
      "accepted_source": "01a0a5e7-dfe0-707e-9db1-21e917fd2b5d",
      "finding_count": 4,
      "response": null
    }
  ],
  "reviews": [
    {
      "review_attempt_id": "design-review:01a0a5e7-dfe0-707e-9db1-21e917fd2b5d",
      "outcome": "failed",
      "accepted": 0,
      "head_sha": "f7d608cbed6e0bf6b88d9eb5c3eb38b4d04c9d22"
    },
    {
      "review_attempt_id": "design-review:01a0a60d-221c-72f4-88ed-b00c15115ade",
      "outcome": "failed",
      "accepted": 0,
      "head_sha": "f7d608cbed6e0bf6b88d9eb5c3eb38b4d04c9d22"
    },
    {
      "review_attempt_id": "design-review:independent-receipt:01a0a60d-221c-72f4-88ed-b00c15115ade",
      "outcome": "concerns",
      "accepted": 1,
      "head_sha": "f7d608cbed6e0bf6b88d9eb5c3eb38b4d04c9d22"
    }
  ],
  "waits": [
    {
      "visit_sequence": 12,
      "status": "consumed",
      "consumed_delivery_id": null,
      "consumed_at": "2026-09-15T15:48:08.054Z"
    },
    {
      "visit_sequence": 20,
      "status": "consumed",
      "consumed_delivery_id": null,
      "consumed_at": "2026-09-15T18:37:11.827Z"
    }
  ],
  "implementationStarted": false
}
```
