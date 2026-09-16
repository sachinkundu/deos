# Implementation canary failure register

This is the shared failure and intervention record for successive small web-app
canaries. The endpoint is an implementation PR with a working preview and useful,
correct screenshots. Merging or releasing the sample app is not required.

## How to compare runs

Record every observed unexpected failure, including one an agent recovers from.
Keep expected negative test cases separate. For each occurrence retain its time,
stage, original error or visible mismatch, evidence, cause when known, repair,
deployment and retry outcome. Do not replace an error with its eventual success.
An unknown cause stays unknown until evidence establishes it.

Count distinct causes and failure occurrences separately. Repeated symptoms of
one cause remain separate occurrences. Track supervisor recovery actions, agent
retries, time blocked, and time from the initial trigger to the implementation PR.
Creating the issue and the two authorized proposal/design approvals are expected
actions, not recovery interventions. Local operator mistakes are recorded
separately so they do not inflate application/workflow failure counts.

Compare only completed canaries with the same endpoint and observation coverage.
An in-flight zero is not an unattended success. A retrospective lower bound is
not a complete baseline, and cannot establish a percentage improvement.

## Runs

| Canary | Scope | Coverage | Workflow failures | Recovery interventions | Outcome |
| --- | --- | --- | --- | --- | --- |
| [SAC-225](https://linear.app/sachinkundu/issue/SAC-225/build-a-simple-web-calculator) | Calculator, desktop and mobile | Retrospective; incomplete occurrence counts | Multiple; historical categories below, exact total unknown | Multiple; exact total unknown | Reached [PR33](https://github.com/sachinkundu/deos-sample-project/pull/33) with supervision; PR closed unmerged and issue Done on 2026-09-16 |
| [SAC-238](https://linear.app/sachinkundu/issue/SAC-238/build-a-desktop-packing-list-web-app) | Desktop packing list; no mobile | Prospective from first trigger, 2026-09-16 14:06:26 UTC | 0 observed at startup; still running | 0 at startup | Planning author started on workflow v39; implementation PR pending |

SAC-182 remains parked. It is larger than these small-app trials and is not a
comparable trend sample. Its historical failures remain in the
[SAC-172 evidence record](evidence/sac-172/README.md).

## Calculator baseline: known historical failures and interventions

These entries index retained evidence; they are not a complete incident count.
Some evidence records contain several occurrences or historical statements
superseded by the [current contract](implementation-canary-lessons.md).

| ID | Stage and observed problem | General correction / remaining limit | Evidence |
| --- | --- | --- | --- |
| CAL-01 | Ingress receipt saved before an unfinished Queue handoff; retry skipped it | Atomic delivery outbox, lease and scheduled replay deployed; SAC-226 | [Rollout](evidence/sac-172/canary-lessons/README.md) |
| CAL-02 | Design recheck source metadata was rejected | Clarified planning review source contract; saved original result | [Design recovery](evidence/sac-172/demo-gate/sac-225-design-recovery.md) |
| CAL-03 | Failure collector omitted private parent transcript, blocking continuation | Preserve private stream; audited recovery of already observed bytes | [Design recovery](evidence/sac-172/demo-gate/sac-225-design-recovery.md) |
| CAL-04 | Missing design dispositions and partial normal collection collided with failure artifact keys | Separate failure prefix and output finalization recovery | [Design recovery](evidence/sac-172/demo-gate/sac-225-design-recovery.md) |
| CAL-05 | Independent design review used an envelope-root source pointer | Canonicalize equivalent pointer form while preserving original review | [Design recovery](evidence/sac-172/demo-gate/sac-225-design-recovery.md) |
| CAL-06 | Independent review exited with no observed result; exact cause unproven | Re-read final files after exit and preserve process status; recovered earlier receipt | [Design recovery](evidence/sac-172/demo-gate/sac-225-design-recovery.md) |
| CAL-07 | An old reconciliation wait remained open after retry and blocked the new wait | Consume the departed wait atomically; audit and repair historical rows | [Design recovery](evidence/sac-172/demo-gate/sac-225-design-recovery.md) |
| CAL-08 | Provider pause returned internal RPC error during recovery | Read saved state, replay the same operation; preserve original error | [Design recovery](evidence/sac-172/demo-gate/sac-225-design-recovery.md) |
| CAL-09 | Frozen planning-only definition omitted implementation despite a newer project route | Explicit audited handoff; new canaries start on the implementation definition | [Implementation handoff](evidence/sac-172/demo-gate/sac-225-implementation-handoff.md) |
| CAL-10 | Preview remained HTTP 530/1016 during initial readiness window and became quarantined | Reconcile the saved preview before replacement | [Preview recovery](evidence/sac-172/demo-gate/sac-225-preview-recovery.md) |
| CAL-11 | Service browser eviction interrupted the demo | Preserve failure and restore through the authorized recovery path | [Browser eviction](evidence/sac-172/demo-gate/sac-225-browser-eviction.md) |
| CAL-12 | Demo-plan acceptance closed the answer before the author received it | Carry accepted clarification history to subsequent agents | [Reply handoff](evidence/sac-172/demo-gate/sac-225-demo-reply-handoff.md) |
| CAL-13 | Demo plan drifted from preview scope and added infrastructure recovery testing to the app demo | Ground demos in approved scope and actual runtime capabilities | [Reply handoff](evidence/sac-172/demo-gate/sac-225-demo-reply-handoff.md) |
| CAL-14 | Repeated screenshot bytes collided with a prior proof key; an unsaved receipt was returned | Scope proof storage appropriately and read back saved receipts | [Proof repair](evidence/sac-172/demo-gate/sac-225-repeated-proof-repair.md) |
| CAL-15 | Required keyboard and viewport commands were absent | Added native browser commands; do not add mobile scope to SAC-238 | [Proof repair](evidence/sac-172/demo-gate/sac-225-repeated-proof-repair.md) |
| CAL-16 | Hosted preview needed maintainer deployment; provider read-back used unsupported redirect option | Fixed Workers fetch mode; trusted static publisher now available to agents | [Hosted preview](evidence/sac-172/demo-gate/sac-225-hosted-preview.md), [current rollout](evidence/sac-172/canary-lessons/README.md) |
| CAL-17 | Completion and demo-output checks stalled or rejected agent work | Workflow now routes agent output; one Claude review and one author response | [Message handoff](evidence/sac-172/message-handoff.md), [current contract](implementation-canary-lessons.md) |
| CAL-18 | GitHub rejected a generated Actions workflow because the App lacked Workflows write | Ask on Linear with code preserved; trusted preview capability avoids requiring an Actions file | [Human publication handoff](evidence/sac-172/publication-human-handoff.md) |
| CAL-19 | PR proof included internal checks/discussion and broken or mismatched images | Review gallery and diagnostic output separated; user template retained | [Current contract](implementation-canary-lessons.md) |
| CAL-20 | Shared-browser scenarios interleaved; captions and screenshot state disagreed | One ordered scenario-list request, fresh context per scenario, fixed app/harness, selected completed gallery | [Browser scenarios](evidence/sac-172/browser-scenarios.md), [current contract](implementation-canary-lessons.md) |
| CAL-21 | Model capacity interrupted work | Capacity fallback remains deferred in SAC-235; do not silently change model | [Capacity record](evidence/sac-172/demo-gate/sac-225-capacity-container-proof.json) |

## SAC-238 run record

- User authorized automatic approval of proposal/specification and design gates
  for this canary. Stop at the implementation PR; do not merge it.
- Trigger: genuine Linear Todo transition at 2026-09-16 14:06:26 UTC.
- Delivery: `bdc5e85c-8a1e-4c76-b438-9799452f7519`, outbox sent once.
- Run: `workflow:99426d9b-cda7-4db4-9136-692a95a0b090:cdd0bff1-00fd-42db-adcd-6e693228bee8:run:1`.
- Frozen definition: implementation v39, digest
  `e4c09e10838c6470db75b9a0dcad83e2c8ecc8ef27e1b1c6d4216ee0de51ba0c`.
- Runtime source at start: `d994b64`; documentation branch head `5485dbe`.
- Planning attempt started: 2026-09-16 14:06:51 UTC.
- No unexpected workflow failure has been observed at startup. This is not a
  completion result. Append incidents and stage outcomes below as they occur.

### Incidents

None observed yet.

### Supervisor and measurement notes

- 2026-09-16 before trigger: the first read-only preflight query used nonexistent
  `agent_attempts.status`; D1 returned `no such column: status`. Corrected the
  query after schema inspection (`state` is the field). No mutation or run
  impact. This is an operator query error, excluded from workflow counts.
- Several local lookup commands used stale file paths/globs. Corrected by file
  discovery; no effect on the cloud run. Keep operator mistakes separate from
  unattended workflow defects.
- Calculator closure is user-authorized canary retirement, not an implementation
  merge or a release. Its original PR, images and failure evidence remain.
