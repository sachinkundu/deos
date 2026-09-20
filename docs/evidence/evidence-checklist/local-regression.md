# Evidence checklist regression proof

*2026-09-20T07:40:05Z by Showboat 0.6.1*
<!-- showboat-id: 7d1aee38-5ff4-4e11-b89b-0689c1fe810a -->

Local regression proof only. These tests exercise evidence preservation, checklist bookkeeping, failure snapshots and publication through mocked provider adapters. They do not establish a new Cloudflare canary result.

```bash
rtk proxy node --experimental-strip-types --test tests/implementation-browser-demo.test.ts tests/implementation-proof-selection.test.ts tests/implementation-evidence-checklist.test.ts tests/implementation-pr-proof.test.ts tests/implementation-failure-capture.test.ts tests/implementation-reading-repairs.test.ts
```

```output
[rtk] /!\ No hook installed — run `rtk init -g` for automatic token savings
✔ a complete frozen scenario list holds the queue against other demos and raw browser calls (2.336917ms)
✔ a failed correction preserves earlier proof and its cause; only completed corrections add images (1.414208ms)
✔ a scenario cannot change the harness, target, viewport or reset midway (0.43225ms)
✔ the eleven-image main flow survives a three-image response, restart and final selection (1.49225ms)
✔ agents can share an image across scenarios or explain an inapplicable item; there is no quota (0.278833ms)
✔ pending items, lost links, omitted items and stale plans fail the structural check (0.493ms)
✔ publication rejects a missing checklist item before touching GitHub or artifacts (0.348209ms)
{"event":"deos.original_error","location":"implementation.failure.process","error":{"stack":"Error: Implementation process stopped: supervisor_failed\n    at captureImplementationFailure (file:///Users/sachin/code/deos/evidence-checklist-workspace/src/implementation-failure-capture.ts:84:21)\n    at async waitForActual (node:assert:615:5)\n    at async strict.rejects (node:assert:738:25)\n    at async TestContext.<anonymous> (file:///Users/sachin/code/deos/evidence-checklist-workspace/tests/implementation-failure-capture.test.ts:71:3)\n    at async Test.run (node:internal/test_runner/test:1404:7)\n    at async Test.processPendingSubtests (node:internal/test_runner/test:969:7)","message":"Implementation process stopped: supervisor_failed","cause":{"attemptId":"failed","category":"supervisor_failed","processId":"process","lastHeartbeat":{"attemptId":"failed","observedAt":"2026-09-15T06:31:48Z","processPid":76},"status":{"state":"error","exit":{"code":137,"signal":9,"timedOut":false}},"output":{"exitCode":137,"signal":9,"stdout":"partial output","stderr":"original process diagnostic","timedOut":false,"truncated":false}},"name":"Error"},"occurredAt":"2026-09-20T07:40:07.107Z"}
✔ a killed supervisor's working tree and private captures survive without a result or candidate (782.804875ms)
✔ failure capture retains exit details and refuses cleanup when the snapshot command fails (1.756125ms)
✔ GitHub proof preserves binary images, replay and the PR template for public repositories (131.837375ms)
✔ GitHub proof preserves binary images, replay and the PR template for private repositories (113.3275ms)
✔ author selection controls PR order and keeps obsolete captures in the saved evidence (1.001167ms)
✔ unknown IDs are rejected by the tool without replacing the author's valid selection (0.289708ms)
✔ legacy jobs keep their gallery and an explicit empty selection is allowed (0.079041ms)
✔ a correction selection cannot silently drop earlier selected images (0.2395ms)
✔ one real task transition at a time preserves content, fences and idempotent retries (16.218875ms)
✔ static preview defaults to hosted while backend and explicit local requests keep local D1/R2 (1.002875ms)
✔ a failed checked shell command or pipeline cannot be hidden by a later successful echo (19.089834ms)
✔ scenario selection map shows omitted captures without deciding coverage or losing original proof (0.47975ms)
✔ progress diagnostics distinguishes absent telemetry from unreadable or malformed telemetry (1.792375ms)
ℹ tests 20
ℹ suites 0
ℹ pass 20
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 902.44025
```

```bash
rtk proxy node --experimental-strip-types --test tests/implementation-proof-selection.test.ts
```

```output
[rtk] /!\ No hook installed — run `rtk init -g` for automatic token savings
✔ author selection controls PR order and keeps obsolete captures in the saved evidence (1.02525ms)
✔ unknown IDs are rejected by the tool without replacing the author's valid selection (0.294416ms)
✔ legacy jobs keep their gallery and an explicit empty selection is allowed (0.076458ms)
✔ a correction selection cannot silently drop earlier selected images (0.237958ms)
ℹ tests 4
ℹ suites 0
ℹ pass 4
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 111.23375
```

```bash
rtk proxy npm run typecheck
```

```output
[rtk] /!\ No hook installed — run `rtk init -g` for automatic token savings

> typecheck
> tsc --noEmit

```
