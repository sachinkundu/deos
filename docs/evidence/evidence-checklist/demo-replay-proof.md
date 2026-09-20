# SAC-246 real-artifact replay

*2026-09-20T07:48:34Z by Showboat 0.6.1*
<!-- showboat-id: 2e82f6b8-2d36-4c81-83ec-6e9767de8134 -->

Replays the original 18 September screenshots and provider receipts through the changed evidence runtime and publisher. The GitHub write boundary uses a local sink. Checklist answers are explicit replay fixtures. No application implementation, browser scenario, cloud agent, or live provider operation is rerun.

```bash
rtk proxy node --experimental-strip-types scripts/replay-evidence-checklist.mjs
```

```output
[rtk] /!\ No hook installed — run `rtk init -g` for automatic token savings
{
  "result": "PASS",
  "mainImages": 11,
  "correctiveImages": 3,
  "retainedImages": 14,
  "checklistItems": 7,
  "verifiedLinks": 16,
  "negativeChecks": 2,
  "replayedWithoutAdditionalWrites": true,
  "applicationRebuilt": false,
  "cloudAgentInvoked": false,
  "output": "/Users/sachin/code/deos/evidence-checklist-workspace/docs/evidence/evidence-checklist/demo-replay"
}
```
