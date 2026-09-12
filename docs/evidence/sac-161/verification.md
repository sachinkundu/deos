# SAC-161 implementation evidence

*2026-09-12T12:18:56Z by Showboat 0.6.1*
<!-- showboat-id: 8325e009-1332-4bab-b2d6-18f82f602926 -->

```bash
rtk gh pr view 113 --json state,mergedAt,url
```

```output
{"mergedAt":"2026-09-12T11:58:47Z","state":"MERGED","url":"https://github.com/sachinkundu/deos/pull/113"}
```

```bash
rtk proxy python3 scripts/inspect-claude-review.py --env-file /Users/sachin/code/deos/.env --issue-id 096ce85d-9c56-4faa-ad74-ef8055bafc91 | python3 -c 'import json,sys; print(json.dumps([{k:r[k] for k in ("run_id", "status", "current_node", "definition_version")} for r in json.load(sys.stdin)], indent=2))'
```

```output
[
  {
    "run_id": "workflow:2a653831-c1ec-4db7-972a-d0d08ac0a3d8:096ce85d-9c56-4faa-ad74-ef8055bafc91:run:1",
    "status": "succeeded",
    "current_node": "done",
    "definition_version": 24
  }
]
```

```bash
rtk proxy node --experimental-strip-types --test portal/tests/recent-issues.test.ts
```

```output
✔ D1 atomic history isolates people, trims, moves duplicates, and rolls back failed snapshots (890.029667ms)
{"operation":"recent_issues.list","error":{"stack":"Error: D1 unavailable\n    at Object.list (file:///Users/sachin/code/deos-sac-161/portal/tests/recent-issues.test.ts:83:103)\n    at routePortalRequest (file:///Users/sachin/code/deos-sac-161/portal/src/worker.ts:279:86)\n    at async TestContext.<anonymous> (file:///Users/sachin/code/deos-sac-161/portal/tests/recent-issues.test.ts:96:19)\n    at async Test.run (node:internal/test_runner/test:1404:7)\n    at async Test.processPendingSubtests (node:internal/test_runner/test:969:7)","message":"D1 unavailable","name":"Error"}}
{"operation":"recent_issues.record","error":{"stack":"Error: D1 unavailable\n    at Object.record (file:///Users/sachin/code/deos-sac-161/portal/tests/recent-issues.test.ts:84:229)\n    at routePortalRequest (file:///Users/sachin/code/deos-sac-161/portal/src/worker.ts:294:111)\n    at async TestContext.<anonymous> (file:///Users/sachin/code/deos-sac-161/portal/tests/recent-issues.test.ts:99:18)\n    at async Test.run (node:internal/test_runner/test:1404:7)\n    at async Test.processPendingSubtests (node:internal/test_runner/test:969:7)","message":"D1 unavailable","name":"Error"}}
✔ verified subject survives email rename while reused email and different issuers stay isolated (73.246291ms)
✔ late load and search snapshots cannot replace a newer commit (0.164209ms)
✔ history API records only exact eligible GET searches, returns explicit errors, and opens stable IDs read-only (4.628708ms)
ℹ tests 4
ℹ suites 0
ℹ pass 4
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1319.44025
```

Local verification: 374 backend tests, 73 portal tests, and 59 Python tests passed. Type checks, binding checks, lint, OpenSpec validation, portal builds, and Worker dry runs passed. Live staging feature verification is still pending; see README.md for the observed deployment and identity prerequisites.

```bash
rtk proxy python3 docs/evidence/sac-161/read_live.py /Users/sachin/code/deos/.env
```

```output
{
  "versionsAt100Percent": {
    "deos-queue-consumer-ts": "2cde8efc-b6ca-4e05-b628-25e8a16a4838",
    "deos-workflow-portal-staging": "0a1c7617-05ac-4405-97e7-a63bc21a31a5",
    "deos-workflow-portal": "b01771d7-464b-4c5d-b6d8-e613f759f201"
  },
  "history": [
    {
      "recency_id": 11,
      "issue_identifier": "SAC-161"
    },
    {
      "recency_id": 10,
      "issue_identifier": "SAC-154"
    },
    {
      "recency_id": 9,
      "issue_identifier": "SAC-160"
    },
    {
      "recency_id": 8,
      "issue_identifier": "SAC-155"
    },
    {
      "recency_id": 7,
      "issue_identifier": "SAC-151"
    },
    {
      "recency_id": 6,
      "issue_identifier": "SAC-166"
    },
    {
      "recency_id": 5,
      "issue_identifier": "SAC-167"
    },
    {
      "recency_id": 4,
      "issue_identifier": "SAC-168"
    },
    {
      "recency_id": 3,
      "issue_identifier": "SAC-171"
    },
    {
      "recency_id": 1,
      "issue_identifier": "SAC-153"
    }
  ],
  "workflowStatesUnchanged": 10,
  "productionPortalUnchanged": true
}
```

The preceding readback caught an intervening backend deployment (`2cde8efc`). It preserved D1 rows but omitted the history entrypoint. The final combined deployment preserves that newer backend fix and restores history. Brave Retry returned HTTP 200 with the same ten entries; see `staging-recovery.json`.

```bash
rtk proxy python3 docs/evidence/sac-161/read_live.py /Users/sachin/code/deos/.env
```

```output
{
  "versionsAt100Percent": {
    "deos-queue-consumer-ts": "55d1b170-2fc1-4676-b3d0-54eb357595f2",
    "deos-workflow-portal-staging": "0a1c7617-05ac-4405-97e7-a63bc21a31a5",
    "deos-workflow-portal": "b01771d7-464b-4c5d-b6d8-e613f759f201"
  },
  "history": [
    {
      "recency_id": 11,
      "issue_identifier": "SAC-161"
    },
    {
      "recency_id": 10,
      "issue_identifier": "SAC-154"
    },
    {
      "recency_id": 9,
      "issue_identifier": "SAC-160"
    },
    {
      "recency_id": 8,
      "issue_identifier": "SAC-155"
    },
    {
      "recency_id": 7,
      "issue_identifier": "SAC-151"
    },
    {
      "recency_id": 6,
      "issue_identifier": "SAC-166"
    },
    {
      "recency_id": 5,
      "issue_identifier": "SAC-167"
    },
    {
      "recency_id": 4,
      "issue_identifier": "SAC-168"
    },
    {
      "recency_id": 3,
      "issue_identifier": "SAC-171"
    },
    {
      "recency_id": 1,
      "issue_identifier": "SAC-153"
    }
  ],
  "workflowStatesUnchanged": 10,
  "productionPortalUnchanged": true
}
```
