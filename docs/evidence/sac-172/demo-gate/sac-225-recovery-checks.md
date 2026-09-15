# Calculator canary recovery checks

*2026-09-15T20:19:32Z by Showboat 0.6.1*
<!-- showboat-id: afaae7fd-26a3-44ea-b7d5-c0422c865434 -->

```bash
rtk proxy node --experimental-strip-types --test tests/implementation-preview-reconciliation.test.ts tests/implementation-preview.test.ts tests/implementation-process-failure.test.ts
```

```output
✔ a delayed preview recovers the existing owned tunnel and retains its original error (117.224875ms)
✔ failed or redirected readiness leaves the preview quarantined with the original response (283.249166ms)
✔ missing, ambiguous, replaced and untrusted tunnels cannot be adopted (554.088584ms)
✔ stale visits, inactive attempts and cleanup during a health check cannot revive a preview (377.334667ms)
✔ preview readiness waits on the same URL after origin DNS startup errors (18.01825ms)
✔ preview readiness is bounded and retains original errors without claiming a failed page is ready (2.826792ms)
✔ preview forwarding uses only the live try's app and preserves request and response data (102.390291ms)
✔ a provider capacity failure survives without a completion result file (0.941042ms)
✔ a later failed turn retains its own signal and diagnostics without blaming a prior error (0.16875ms)
✔ successful completion is not failed by earlier recoverable diagnostics (0.0835ms)
ℹ tests 10
ℹ suites 0
ℹ pass 10
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1430.303958
```

```bash
rtk proxy docker run --rm --platform linux/amd64 --entrypoint node -v /Users/sachin/code/deos-sac-172:/proof:ro registry.cloudflare.com/c68856288112af7698f5be52ea94b96e/deos-queue-consumer-ts-implementationsandbox@sha256:88f935668ca4ab24c04b107f09e3d82c71c0fb96c209812fcc78465a06d6bb17 --experimental-strip-types /proof/scripts/sac-172/verification-repair-proof.mjs --capacity-failure
```

```output
{
  "proof": "local container with a deterministic provider capacity failure",
  "supervisorExit": 1,
  "status": {
    "exitCode": 1,
    "signal": null,
    "timedOut": false,
    "safeErrorCategory": "codex_exit_nonzero",
    "originalError": {
      "message": "Error: Selected model is at capacity. Please try a different model.",
      "stack": "Error: Selected model is at capacity. Please try a different model.\n    at implementationProcessFailure (file:///deos/bin/implementation-process-failure.mjs:17:17)\n    at main (file:///deos/bin/supervisor.mjs:321:21)",
      "cause": "{\n  process: { code: 1, signal: null },\n  failures: [\n    {\n      type: 'error',\n      message: 'Selected model is at capacity. Please try a different model.'\n    },\n    {\n      type: 'turn.failed',\n      error: { message: 'Selected model is at capacity. Please try a different model.' }\n    }\n  ],\n  malformed: [],\n  stderr: ''\n}"
    },
    "completedAt": "2026-09-15T20:23:10.023Z"
  },
  "savedWork": true,
  "completionSignals": 1,
  "missingResultDidNotMaskFailure": true
}
```

```bash
rtk proxy python3 /tmp/sac225-recovery-deployment-readback.py --require-ready
```

```output
{
  "observedAt": "2026-09-15T20:27:52.837535+00:00",
  "sourceCommit": "a3730d9",
  "backend": {
    "versions": [
      {
        "version_id": "610c3edd-a023-4ec6-b0df-82e329cb5bfc",
        "percentage": 100
      }
    ],
    "createdOn": "2026-09-15T20:20:55.266309Z"
  },
  "staging": {
    "versions": [
      {
        "version_id": "6104497f-2a1b-4c55-b425-2ed4dcaf340e",
        "percentage": 100
      }
    ],
    "createdOn": "2026-09-15T18:55:35.725381Z"
  },
  "applications": [
    {
      "id": "a030fe98-cbb0-423c-90aa-9e4d9cb896a2",
      "name": "deos-queue-consumer-ts-implementationstandard2sandbox",
      "version": 15,
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
      "image": "registry.cloudflare.com/c68856288112af7698f5be52ea94b96e/deos-queue-consumer-ts-implementationstandard2sandbox@sha256:88f935668ca4ab24c04b107f09e3d82c71c0fb96c209812fcc78465a06d6bb17"
    },
    {
      "id": "a03d2322-d47e-405d-86d1-9366e458cf5e",
      "name": "deos-queue-consumer-ts-implementationsandbox",
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
      "image": "registry.cloudflare.com/c68856288112af7698f5be52ea94b96e/deos-queue-consumer-ts-implementationsandbox@sha256:88f935668ca4ab24c04b107f09e3d82c71c0fb96c209812fcc78465a06d6bb17"
    },
    {
      "id": "a03d8a75-5574-4d37-806d-8b07ed1a79c6",
      "name": "deos-queue-consumer-ts-standard2sandbox",
      "version": 21,
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
      "image": "registry.cloudflare.com/c68856288112af7698f5be52ea94b96e/deos-queue-consumer-ts-standard2sandbox@sha256:88f935668ca4ab24c04b107f09e3d82c71c0fb96c209812fcc78465a06d6bb17"
    },
    {
      "id": "a0344373-884d-4c06-b4c2-4e58295de498",
      "name": "deos-queue-consumer-ts-sandbox",
      "version": 79,
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
      "image": "registry.cloudflare.com/c68856288112af7698f5be52ea94b96e/deos-queue-consumer-ts-sandbox@sha256:88f935668ca4ab24c04b107f09e3d82c71c0fb96c209812fcc78465a06d6bb17"
    }
  ],
  "ready": true
}
```
