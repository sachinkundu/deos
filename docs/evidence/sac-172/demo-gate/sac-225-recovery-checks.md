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
