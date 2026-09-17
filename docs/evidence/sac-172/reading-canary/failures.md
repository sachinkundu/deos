# SAC-245 failure and intervention log

Started prospectively on 17 September 2026, before the real Linear trigger. Endpoint: implementation PR ready for human review, unmerged and unreleased. Cloudflare agents alone author app code and proof.

No failures observed at preflight. This is an in-flight observation, not a reliability conclusion. Full transcript auditing is required before final counts.

| ID | UTC time / stage | Original failure or mismatch | Cause | Recovery and outcome | Evidence |
| --- | --- | --- | --- | --- | --- |
| READ-01 | 09:37–09:40, planning independent response, item_1 | `pwd && rg --files -g AGENTS.md ... && git status ...` exited 1 after printing only `/deos/workspace/repository` | No matching AGENTS.md in the sample checkout; shell `&&` prevented subsequent inventory commands | Author continued and completed the stage normally. No workflow change or supervisor retry needed. This repeats the expense canary's missing-file inventory behavior. | [Verified transcript excerpt](planning-stages-audit.json) |

## Normal actions

- 09:14:29: D1 preflight confirmed no run and no active attempts; implementation v39 enabled, backend 8027527b at 100%.
- 09:15:36.240: Real Linear Todo transition; relevant delivery de0b70ea-1ca2-4f87-ad55-a621fdc7505d received at 09:15:37.048; run 1 created at 09:15:44.488. Saved D1 readback confirms provider-originated start.
- Five-minute supervision heartbeat run-reading-queue-canary-to-pr created successfully for this task; normal progress stays quiet, completion and substantive problems notify.
- 09:43:46–09:44:06: reviewed the full PR40 diff at `e0ba9f693b46485a544ee4643088c39e147e4ef8`; independent review and traceability passed, durable planning gate8 open. Approved through a Linear comment and Merging transition. Delivery `9e3ee3a4-b001-4615-baa5-116af28a5325` consumed at09:44:02.221; PR40 merged09:44:06 as `12bf39e828964fef34825f7f2776dfc932f74535`. Normal authorized gate, not recovery.

## Operator errors

- 09:36 UTC: local helper discovery with `rg --files /tmp` encountered `Permission denied (os error 13)` for an unrelated device semaphore. Discovery was narrowed to `/tmp/*.py`; no cloud request or run state was affected. One local inventory error, excluded from cloud workflow counts.

## Planning quality findings

- 09:29 UTC: prepared self-review had raised seven traceability findings. The author revised the planning artifacts; the fresh recheck reports six fixed and one ambiguous directional link between status counts in the proposal and the delete requirement. The trusted self-review continuation is still active. This is a quality finding under normal agent revision, not an observed command or workflow failure. No local artifact edits or recovery intervention. [Captured finding evidence](planning-quality-findings.json); full private snapshot `/tmp/sac245-reader/2026-09-17T09-29-29.845Z.json`.
- 09:34:17: planning author completed normally and its sandbox was destroyed. Independent discovery started at 09:34:34.767. Sixteen completed author artifacts were downloaded from R2 with SHA256 verification; transcript scan found no nonzero command exits or explicit error/turn-failed events. Saved trace validations passed. [Audit summary](planning-author-audit.json). No recovery intervention; final whole-run audit remains pending.
