# Implementation canary failure register

This is the shared failure and intervention record for successive small web-app
canaries. The endpoint is an implementation PR with a working preview and useful,
correct screenshots. Merging or releasing the sample app is not required.
For the storage canary, the temporary preview is retired after evidence and PR
publication; durable screenshots and storage receipts are the review artifact.

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

### SAC-246 prospective D1/R2 snippet-shelf canary

- [Supervision contract](evidence/sac-172/storage-canary/supervision.md), [failure log](evidence/sac-172/storage-canary/failures.md) and [read-only D1 collector](evidence/sac-172/storage-canary/readback.py).
- The user authorizes automatic prerequisite gates and routine answers. Cloudflare agents alone build the app and its tests and proof. Stop at an unmerged implementation PR, then confirm deletion of all temporary app resources while retaining GitHub evidence.
- Baseline repairs are on main through PR138. The temporary environment extension is in draft PR139, with passing CI and a real provider lifecycle probe. That probe is not the full cloud-agent canary. Preflight operator and extension errors are recorded in the [extension failure log](evidence/temporary-environments/failures.md).
- Genuine Linear Todo event13:37:18.201UTC created run1 at13:37:26.619 on frozen implementation v41. Cloud planning author started. No reliability conclusion or completed cloud-agent failure count yet.
- At13:40 the supervisor's still-running container rollout killed the planning runner (STORE-01). Added completed-rollout launch checks and repaired interrupted-attempt cleanup (STORE-02). The same planning stage resumed on frozen v41 at13:52:33 after verified cleanup. Original provider error, missing-output manifest and recovery receipts are retained. No application code was written locally; this is a supervised run.

### SAC-245 prospective reading-queue canary

- User authorizes automatic prerequisite gates, routine answers and safe workflow repairs. Cloudflare agents alone author application implementation and proof. Stop at the completed implementation PR, unmerged/unreleased.
- [Supervision contract](evidence/sac-172/reading-canary/supervision.md), [prospective failure and intervention log](evidence/sac-172/reading-canary/failures.md), and [read-only D1 collector](evidence/sac-172/reading-canary/readback.py).
- Preflight 2026-09-17 09:14:29 UTC: no existing run or active attempts; implementation v39 enabled; corrected Worker 8027527b-c89b-4cbd-8c57-dc98793964e6 at 100%.
- Completed at implementation Human Review: [PR42](https://github.com/sachinkundu/deos-sample-project/pull/42), unmerged/unreleased at the recorded endpoint, with a working hosted preview and 13 verified public screenshots. 31 cloud tests and the final five-scenario collection passed. One supervisor workflow repair/deployment and one saved-stage retry; not an unattended success.
- [Final failure analysis](evidence/sac-172/reading-canary/failure-analysis.md): 21 workflow/tool events across 15 problem groups, including five discovery misses; two separate reporting/bookkeeping defects; zero observed app test failures. Six propagated review error rows count as one incident, and masked relay errors remain counted. Trigger to implementation Human Review: 2h 23m 16s, versus 2h 20m 28s for SAC-243. Earlier operation-status, dependency and saved-result repairs worked in this run; preview setup, incremental task reporting and cleanup convergence remain follow-ups. No general reliability percentage is inferred.
- 11:08UTC: implementation and seven scenarios completed, but Claude review stopped on a directory search unsupported by the frozen-source reader (READ-12). Saved candidate and proof retained; workflow-only reader repair validated and activated; same-stage Claude review resumed11:19:49 with the original candidate/proof. READ-11 separately records delayed bulk checklist reporting.
- Post-run corrections are [prepared with regression evidence](evidence/sac-172/reading-canary/prepared-repairs.md), not deployed: single-task reporting, static-preview routing, failure visibility, cleanup convergence, scenario selection context and notification timing. Unknown provider transport causes remain open. A [simple D1/R2 canary](evidence/sac-172/reading-canary/next-storage-canary.md) is scoped but not launched; persistent remote backend preview capability is still required.

### SAC-243 prospective expense-tracker canary

- Created 2026-09-17 05:24:17 UTC: [SAC-243](https://linear.app/sachinkundu/issue/SAC-243/build-a-desktop-expense-tracker), sample project. Scope: one desktop screen, euro expenses, categories, visible-list total, browser-local persistence.
- User explicitly authorizes automatic proposal/specification and design approvals, routine answers, and safe workflow recovery. Cloudflare agents alone edit application implementation and capture proof. Stop at implementation PR, unmerged/unreleased.
- Preflight D1: no existing run for this issue and no active attempts. Project selects implementation v39, digest `e4c09e10838c6470db75b9a0dcad83e2c8ecc8ef27e1b1c6d4216ee0de51ba0c`; dispatch enabled. Backend version `c303af4e-27e4-48da-955f-03cb0db7c32f` at 100%, deployed 05:02:22 UTC.
- Prospective read-backs and supervision contract: [expense-canary evidence](evidence/sac-172/expense-canary/supervision.md). Read-only collector: `evidence/sac-172/expense-canary/readback.py`.
- Current result: in flight. No failure count or reliability conclusion yet. Record all observed occurrences and interventions below as work proceeds.
- Genuine Todo trigger at 05:25:17.011 UTC; delivery `32156fc7-6925-4a89-9fcc-8eb0d637d379`. Run created at 05:25:25.632 UTC; planning author started at 05:25:42.939 UTC. Provider receipt and D1 run confirmed. No synthetic trigger was used.
- Automatic supervision every five minutes: `run-expense-tracker-canary-to-pr`, attached to the user's current task. Normal progress stays quiet; completion and substantive problems notify.
- Operator-only setup error at about 05:26 UTC: first heartbeat creation returned `targetThreadId: Missing targetThreadId or destination=thread.` No automation was created by that request. Retried with the explicit current task and thread destination; creation succeeded. Excluded from cloud workflow failure counts.

- Planning gate: author completed 05:37:41 UTC, independent discovery 05:40:53, response finalized before Human Review at 05:44:23.705. Full PR37 diff reviewed; approved head `fce33fa90c308d5e6a061b1a4ef2d7b81827f3a2`. Genuine Linear approval at 05:44:42.439, delivery `7f427cef-87d5-403a-b907-b11c59d4ad56`, consumed 05:44:55.426. PR37 merged 05:44:58 as `269b5811afd556c144f7d1357a12f89a88db0d38`; design author running by 05:45. Normal gate approval, no recovery. Full completed transcript audit pending; no D1 workflow errors observed.

| ID | Time / stage | Original failure or mismatch | Cause / response / outcome | Evidence |
| --- | --- | --- | --- | --- |
| EXP-01 | 05:41–05:43, planning response, item_1 | `rg --files` returned exit1 after only printing cwd; chained inventory did not run | No AGENTS.md match in the disposable repo; author continued with a different inventory command. One recovered agent-tool occurrence; no supervisor repair | [Verified transcript excerpts](evidence/sac-172/expense-canary/planning-command-failures.json) |
| EXP-02 | 05:41–05:43, planning response, item_3 | `find: paths must precede expression: git`, exit1 | Shell command lacked a separator before git. Author recovered in the same attempt. One agent command-construction occurrence; no workflow change needed | [Verified transcript excerpts](evidence/sac-172/expense-canary/planning-command-failures.json) |
| EXP-03 | 06:02–06:04, design response | `sha256sum: .../design.md: No such file or directory`; `sed: can’t read .../design.md: No such file or directory` | One handoff failure with two probe symptoms. Restore query used absent durable `inputs`; actual input list is in `materializedContext.declaredInputs`. Previous design remains in context, but filesystem patch was omitted. Workflow-only SQL fix prepared; regression failed before and passes after. Deployment deferred while author active; recovery outcome pending | [D1 handoff evidence](evidence/sac-172/expense-canary/design-handoff-failure.json), private full snapshot `/tmp/sac243-reader/2026-09-17T06-04-27.282Z.json` |


| Canary | Scope | Coverage | Workflow failures | Recovery interventions | Outcome |
| --- | --- | --- | --- | --- | --- |
| [SAC-225](https://linear.app/sachinkundu/issue/SAC-225/build-a-simple-web-calculator) | Calculator, desktop and mobile | Retrospective; incomplete occurrence counts | Multiple; historical categories below, exact total unknown | Multiple; exact total unknown | Reached [PR33](https://github.com/sachinkundu/deos-sample-project/pull/33) with supervision; PR closed unmerged, issue and workflow Canceled on 2026-09-16; retirement recovery recorded as CAL-22 |
| [SAC-238](https://linear.app/sachinkundu/issue/SAC-238/build-a-desktop-packing-list-web-app) | Desktop packing list; no mobile app scope | Prospective from first trigger, 2026-09-16 14:06:26 UTC; next-day review-client report included | 67 runtime/tool/publication occurrences in 31 categories, including one user-reported mobile PR gallery failure; 4 app development check failures listed separately | 5 recovery interventions: resent approval, resumed design finalization, requested preview-path revision, answered browser-recovery question after runtime rollout, repaired published image links | [PR36](https://github.com/sachinkundu/deos-sample-project/pull/36) opened at 18:11:37 UTC, about 4h05m after trigger; remains at implementation Human Review. Desktop rendering passed, but the user reported missing images in GitHub mobile on September 17. Direct image links repaired; all 17 load in Brave and return anonymous HTTP200. User confirmed the images now display in GitHub mobile on September 17. PR36 closed unmerged and Linear Canceled on 2026-09-17 at user request; supervised run evidence retained. |

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
| CAL-22 | Retirement cancellation was classified eligible but its transition returned stale; run remained at implementation Human Review | Earlier gate-repair status writes replayed outside a durable step. Fixed in d362d69 with a failing-then-passing replay regression and 40 passing orchestrator tests; deployed backend 53de82b2 at 100%. Recovered the retired instance's engine from current D1 gate, then repeated the authorized cancellation. No earlier stage/agent reran. D1 now terminal canceled at visit66; PR33 closed, Linear Canceled | Cancellation delivery `63d8cb42-d05c-4f2e-91bf-790e781cb864`, eligible 2026-09-16 14:16:38.624 UTC, inbox duplicate 14:16:38.850 UTC, gate visit65; [runtime evidence](evidence/sac-172/packing-canary/cal-22.json) |

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
- Planning author completed at 14:23:15 UTC. Independent discovery completed at
  14:26:09 UTC; its response stage completed at 14:29:18 UTC. Review corrections
  completed within those attempts; no stage restart occurred.
- Proposal/specification [PR34](https://github.com/sachinkundu/deos-sample-project/pull/34)
  reached Human Review at 14:29:36 UTC. Approved scope remains desktop only.
- Authorized approval: Linear Merging at 14:46:25.682 UTC, delivery
  `68e9a8d2-f16c-441c-b580-dd6e24f99502`. Review hold was 16m49s, largely
  supervisor diagnosis/deployment time, not agent execution.
- PR34 merged by DEOS at 14:50:24 UTC, merge commit
  `3b1eaf1ef29cb7385ba9310232a77778b5693aa6`.
- Design author started at 14:50:36.050 UTC, attempt
  `01a0aab2-bd2c-7ace-9c62-6563802125d0`. Draft written and strict OpenSpec
  validation passed by the 14:56:25 UTC live read.

- Final design response completed at 15:59:13 UTC. Design Human Review opened
  at 15:59:39.920, PR35 head `1a54fc9b4d2dbf414ee7894603d18127162331b6`.
- The supervisor held approval for the safe platform rollout. Worker activated
  at 16:00:21; all container rollouts had completed by the 16:07 read-back.
- Authorized design approval: Linear Merging at 16:08:32.878 UTC, delivery
  `e181cc57-0a74-4c6e-825e-b37ad9d958f5`. Gate hold was about 8m53s,
  mostly deployment time. This normal approval needed no event resend.
- DEOS merged PR35 at 16:09:01, merge commit
  `119bb5dad37429f25a574579f15e7f58be196fef`.
- Implementation task generation started at 16:09:11.730, attempt
  `01a0aafa-b258-70a4-967a-238a02e8b2f5`, visit28. This is about 2h03m
  after the first trigger, including the recorded failure recovery and holds.
- Task generation completed at 16:14:30.993 (5m19s), producing 29 tasks in
  seven groups. Claude demo planning began at 16:14:35.312, attempt
  `01a0aaff-a29e-7eb3-8477-7b7ab1308a37`, visit29.
- Claude demo planning completed ready at 16:17:25 (2m50s). It selected one
  preview publication command and six browser scenarios. Its saved response
  explicitly applies both later Linear instructions; no further clarification
  or supervisor correction was needed. [Handoff](evidence/sac-172/packing-canary/demo-plan-handoff.json).
- Sol implementation started at 16:17:28.710, attempt
  `01a0ab02-47f4-7ae3-aebc-5601103899eb`, visit30, with the same 29 tasks.
- Build completed at 17:09:25.690 (51m57s), including app edits, recovered
  failures, two successful six-scenario collections, and finalization delay.
  Claude's single demo review began at 17:09:44.359, attempt
  `01a0ab32-202f-795b-8208-b8e5cd90fdbf`, visit32. No supervisor application
  edits, proof captures, or implementation-stage restarts occurred.
- Claude completed its single review at 17:16:44.020 (7m). It found the app real
  and its main behavior demonstrated, then requested current hosted reachability
  proof and clearer reload evidence. These are reviewer findings, not workflow
  failures. Sol's one response pass started at 17:16:47.852, attempt
  `01a0ab38-96a2-7887-9e4f-de399426a5c7`, visit33, with saved implementation.

### Recovery grouping

This groups the observed recovery during SAC-238, not who later fixed the
underlying platform code. Self-recovery includes an agent using a workaround,
a normal workflow retry, or continuing past nonblocking diagnostic noise. It
does not mean the root cause was permanently fixed. The supervisor also shipped
general fixes for many of these cases after the agent had already recovered.

| Recovery | Categories | Occurrences | Supervisor rescue actions |
| --- | --- | --- | --- |
| Cloud agent/workflow recovered or continued without a supervisor rescue | 26 | 60 | 0 |
| Supervisor intervention needed for progress or usable PR delivery | 5 | 7 | 5 |

The four application development failures APP-01 through APP-04 were also
repaired by Sol without supervisor application edits; they remain separate from
the 67 platform/tool/publication occurrences above.

| Needed supervisor intervention | Action that restored progress or delivery |
| --- | --- |
| PACK-03: unconsumed approval signal | Resent the same saved delivery ID; the workflow then consumed it and merged the planning PR |
| PACK-07: stale finalization context and blocked correction | Fixed the harness, released the stopped diagnostic hold, and retried only output finalization from saved work |
| PACK-09: design chose an unavailable preview path | Supplied the actual runtime publisher contract and requested a design revision; the cloud author revised it |
| PACK-30: browser target closed, followed by two failed reconnects | Deployed runtime fixes at the stopped gate and answered the agent's Linear question to resume saved work with a fresh browser |
| PACK-31: PR images missing in GitHub mobile | Fixed the publisher and mechanically replaced the existing gallery's relative URLs; the user confirmed success |

| Recovered without a supervisor rescue | Recorded issues |
| --- | --- |
| Tool selection and setup | PACK-01, PACK-04, PACK-10, PACK-12, PACK-13, PACK-14, PACK-20, PACK-26 |
| Agent handoff and saved context | PACK-05, PACK-11; PACK-11 needed no additional rescue beyond the design revision already counted under PACK-09 |
| Source/scratch handling | PACK-15, PACK-22 |
| Preview and browser operations | PACK-16, PACK-17, PACK-18, PACK-19, PACK-21, PACK-24 |
| Command execution and queue recovery | PACK-23, PACK-27, PACK-28 |
| Workflow lifecycle and diagnostic noise | PACK-02, PACK-06, PACK-08, PACK-25, PACK-29 |

PACK-06's two connection resets were caused by supervisor deployments during
active work. Workflow replay recovered them without a separate rescue. They
remain failures in the total, and the deployment-at-a-stopped-gate lesson remains.

### Deployed correction coverage — 2026-09-17

Live read-back confirms Worker `6af4b501-e84b-4254-924d-d92576dc290e`
at 100% traffic, plus all four healthy container pools on digest
`6f552ca4529de6319b35d96895b3d31606d708bbbb7684a51f5e1ce16ed71337`.
The Worker includes source5ddb411; containers include source32745bc. All completed
canary corrections are deployed. Earlier incident notes saying "pending rollout"
describe their observation time and are superseded by these deployment receipts.

| Correction type | Categories | IDs |
| --- | --- | --- |
| Deployed code/configuration fixes or mitigations | 16 | PACK-02, 03, 04, 07, 08, 09, 10, 11, 12, 13, 17, 18, 22, 23, 28, 31 |
| Deployed agent instructions, hook guidance or runtime skill changes | 9 | PACK-01, 05, 14, 15, 20, 21, 24, 26, 27 |
| Operational lesson or recovery with no new permanent cause fix | 6 | PACK-06, 16, 19, 25, 29, 30 |

Thus 25 of 31 categories have deployed corrections: 21 of the 26 self-recovered
categories and four of the five supervisor-intervention categories. This is
deployment coverage, not a claim that all 25 causes can no longer recur. PACK-03
adds signal replay mitigation and PACK-10 disables unrelated integrations;
their original provider causes remain unproven. PACK-06 is a deployment-practice
change, PACK-25 recovered through existing cleanup reconciliation, and PACK-16,
19, 29 and 30 retain unresolved transport/lifecycle causes. New runs receive the
current code; existing workflow instances retain their frozen version.

### Follow-up on the six remaining categories — 2026-09-17

These findings address the recovery gaps before another canary. They do not
erase the original failures or turn the supervised run into an unattended one.

| Category | Finding and correction |
| --- | --- |
| PACK-06 | Supervisor deployments caused the resets. Repository instructions now require reading D1 and using a stopped boundary even for backend-only or secret updates. Workflow replay already recovered the two incidents. |
| PACK-16 | Public relay readiness failed after the local app was healthy. The runtime now retains that app and its data; an identical preview request reuses the process and reconciles the same relay. The transient DNS cause remains unknown. |
| PACK-19 | The original nested cause is `UND_ERR_SOCKET: other side closed` between the sandbox and tool broker, not a proven browser crash. Lost-response errors now identify the operation and tell the agent to restart the saved scenario with fixture resets. The harness never repeats an ambiguous click. The network cause remains unknown. |
| PACK-25 | Browser close was accepted before inventory confirmed absence. Existing scheduled reconciliation recovered it without rerunning implementation. Keep this as a recovered lifecycle incident; no new provider retry or quality gate is needed. |
| PACK-29 | The watcher logged a timeout but retried only after another file edit. It now resends transient failures with capped backoff, stops on success, rejected credentials or its deadline, and preserves the original error. |
| PACK-30 | The allocator returned the dead session indefinitely. An explicit scenario reset can now replace a provider-confirmed absent session once in the same active attempt. It retains the old receipt and origins, never replaces a live/uncertain session, and cannot loop through replacements. Browser failures retain provider inventory and available close history. Subsequent provider history confirms `BrowserSessionEvicted`; see the receipt below. |

The [original session's provider history](evidence/sac-172/packing-canary/original-browser-eviction.json)
records close reason11, `BrowserSessionEvicted`, at 2026-09-16T17:41:48.295Z.
[Cloudflare documents this reason](https://developers.cloudflare.com/browser-run/reference/browser-close-reasons/)
as infrastructure maintenance or a Browser Run release deployment, not application
code. This disproves the earlier attribution to pressing Enter. The provider
does not expose which maintenance/release operation caused this particular event.

Validation: 594 repository tests passed, one skipped, zero failed; TypeScript and
OpenSpec validation passed. Real HTTP regressions prove retained local service,
dropped progress delivery recovery and no duplicated action on a dropped broker
response. The [real Cloudflare browser lifecycle probe](evidence/sac-172/packing-canary/browser-recovery-proof.json)
deliberately closes its first session, resets into a replacement, reaches HTTP200,
and confirms cleanup. It uses local SQLite/R2 fixtures and starts no workflow.

The diagnostic initially used a compatibility date newer than the installed
workerd supported. Correcting its temporary config to the repository's existing
2026-08-27 date allowed the probe to start. This was a supervisor verification
setup error, outside SAC-238's historical run counts.

Source37f6622 is deployed as Worker `c303af4e-27e4-48da-955f-03cb0db7c32f`
at100%. All four container pools completed on image
`sha256:944784117beeadf0153b590e2a23ed32f64c173467de06f4dab1d21c01d8cc0d`,
each with four healthy instances and no failures. D1 read-back found no active
agent attempts before or after deployment. SAC-238 remains at implementation
review visit41. [Activation and boundary receipt](evidence/sac-172/packing-canary/remaining-six-rollout.json).

Current correction coverage is29categories:20with deployed code/configuration
fixes or mitigations and9with deployed runtime guidance. PACK-06 remains an
operator deployment rule and PACK-25 an existing successful cleanup recovery.
This does not claim that transient provider failures are prevented: PACK-16's
DNS failure and PACK-19's broker socket cause remain unknown. PACK-30's provider
eviction is now identified, with recovery from a confirmed-ended session tested.

### Incidents

#### PACK-01 — unsupported editing tool selection

- Stage: planning author, first attempt, item `item_12`; observed in the live
  transcript captured at 2026-09-16 14:12:30 UTC. The event itself has no timestamp.
- Original error: `bash: line 1: apply_patch: command not found`, exit 127.
- Cause: the author used a shell executable that is not installed in its clean
  PATH. The runtime requires shell-based file edits but did not name the available
  editing tools.
- Recovery: the same agent wrote the files with installed shell tools and passed
  strict OpenSpec validation. No supervisor retry or edit of its files occurred.
- General correction: author prompts and the runtime skill now name Python,
  Node, cat and tee, and state that apply_patch is not a shell executable. This
  source correction passed TypeScript checks, all 42 sandbox-controller tests,
  diff checks and a Wrangler deployment dry run. Commit a7f2eab deployed with
  backend 691c736c and container image `630039625fcdf41cc034dbb445a4c871669e24b48dcfc7b2288d6f9211e04648`.
  All four container rollouts completed before approval. Later backend 53de82b2
  preserves it. An existing Cloudflare instance retains its own version; do not
  claim its already rendered prompts changed. The implementation skill is in
  the new container image.
- Evidence: [original command result](evidence/sac-172/packing-canary/pack-01.json).
- Second occurrence: design author item8, captured at 14:56:25 UTC. Same
  exit127 and recovery via tee. The in-flight Cloudflare instance still renders
  its original prompt version; deployment does not rewrite that code or prompt.
  [Original design command results](evidence/sac-172/packing-canary/design-command-failures.json).
- A later full stderr audit found three earlier native patch-tool rejections:
  planning at 14:08:45.692615 and 14:09:28.786649 UTC, and design at
  14:53:42.540713 UTC. Original message: `Command blocked by PreToolUse hook:
  Use the shell tool to read or edit repository files. Trusted review control
  files are outside the author account.` These are recovered agent tool
  selection errors, not three more stopped stages. The five total occurrences
  include the two shell exit127 failures above.
- The runtime hook now names usable editing tools in its corrective message,
  rather than merely saying "use the shell" and inviting the missing-command
  attempt. This container instruction correction shipped in the 15:27 rollout.
  [Original stderr errors](evidence/sac-172/packing-canary/recovered-hook-errors.json).
- Sixth occurrence: implementation task author attempted a native patch for a
  request file at 16:10:47.556030 UTC. The implementation hook rejected it; the
  same agent recovered with tee. Clarify that both native patch tools and a shell
  apply_patch executable are unavailable. The hook now names supported editing
  tools, and the shipped skill says the same. This correction is pending rollout.
  [Original rejection](evidence/sac-172/packing-canary/task-author-tool-rejections.json).

- Seventh occurrence: the build author tried the native patch tool at
  16:19:15.239945 UTC. It recovered through Node file writes. This attempt still
  uses the earlier image; the clearer correction is awaiting a safe rollout.
  [Build tool rejections](evidence/sac-172/packing-canary/build-tool-rejections.json).
- Eighth occurrence: response attempt01a0ab38 tried the native patch tool at
  17:18:56.050735 and recovered with tee. The clearer hook/skill correction is
  still pending the safe rollout; this new attempt used the current live image.
  [Response startup errors](evidence/sac-172/packing-canary/response-startup-errors.json).

#### PACK-02 — heartbeat read before its first file existed

- Stage: planning author startup, 2026-09-16 14:07:09.457 UTC.
- Original error: `File not found: /deos/output/heartbeat.json`.
- Durable diagnostic: `065205ee-1131-4b05-9971-d30b088b9282` in
  `workflow_errors`; original details retained in its referenced R2 object.
- Recovery: polling subsequently found fresh heartbeats; the same attempt
  completed without supervisor intervention. No stage was stopped.
- Two further occurrences: independent discovery at 14:23:50.749 UTC
  (`4fd45796-77a9-4146-9a69-643290d350f2`) and planning response at
  14:26:31.645 UTC (`cc31d8f7-626e-461b-a9c5-9c2a8eac84c9`). All recovered.
- Cause: the first poll races the supervisor's initial heartbeat write.
  Commit 97c5bf0 seeds the initial deadline before launching the supervisor;
  later timestamps still come only from the supervisor. Regression demonstrates
  a clean first poll and unchanged expiry if no real heartbeat follows.
  All 43 controller tests and TypeScript checks passed. Backend
  `8e98578e-6f03-4a4a-9ef1-43e2bd92a75e` read back at 100%.

#### PACK-03 — approval signal sent but not consumed promptly

- Linear approval at 14:46:25.682 UTC; delivery handoff sent at 14:46:29.678 UTC.
  The Queue consumer saved the inbox as sent at 14:46:35.859 UTC.
- At 14:49 UTC the workflow still waited at the exact `linear-event` step and
  the inbox remained unclaimed. No new agent had started and PR34 was open.
- The reason is unknown; a successful send does not establish consumption.
- Supervisor intervention: at 14:50:15.432 UTC resent only the same saved
  delivery ID via Cloudflare's event API. API accepted it. The planning PR
  merged at 14:50:24 and design started at 14:50:36. This followed the retry;
  it does not prove why the first signal was delayed.
  No repeat Linear approval, manual merge, stage restart or source edit.
- General mitigation in f9a272a: the existing 15-minute scheduled reconciler
  resends old unclaimed signals with their original delivery IDs. It does not
  decide an outcome or repeat an agent. Paused, retired and claimed work is
  skipped, and failures preserve the original provider cause. Four new SQLite
  tests plus 61 related tests and TypeScript checks passed. A further check
  excludes events from an earlier gate and a concurrent gate change. Backend
  `a56ba4ac-5dd2-41c4-a6c4-5e5abc9a666a` read back at 100%.

#### PACK-04 — bundled ripgrep absent from the author's clean PATH

- Stage: design author item2, captured at 14:51:48 UTC.
- Original error: `bash: line 1: rg: command not found`. The enclosing pipeline
  exited zero, so exit-code-only monitoring would miss it.
- Recovery: the same agent used find and direct reads. No supervisor action
  was needed to continue the attempt.
- Cause: the pinned Codex package contains rg in its private codex-path folder;
  the author shell resets PATH and cannot find it there.
- Correction: expose that existing pinned binary in /usr/local/bin and test it
  as deos-author with the actual clean PATH during image build. Local image
  build passed and printed ripgrep15.2.0; the 15:27 cloud rollout includes it.
- Evidence: [original design command results](evidence/sac-172/packing-canary/design-command-failures.json).

#### PACK-05 — author acts before the review handoff completes

- Stage: planning author, 14:15:16.968736 and 14:15:25.483946 UTC.
- Original messages: `Command blocked by PreToolUse hook: Author tools are
  paused until checked review and durable proof complete` for a file edit, and
  the same reason for `multi_agent_v1close_agent`.
- Recovery: the author subsequently yielded to the completion hook and resumed
  normally. No supervisor action or stage retry occurred.
- Cause: the native child had returned, but the author had not yet ended its
  turn to run the completion handoff. The rejection did not explain that next
  action clearly. Guidance now explicitly says to await the reviewer and then
  finish the turn with author JSON before editing or closing the child. Hook
  checks passed; the instruction change shipped in the 15:27 container rollout.
- Evidence: [original stderr errors](evidence/sac-172/packing-canary/recovered-hook-errors.json).

#### PACK-06 — backend deployment resets live workflow RPCs

- Original error: `Durable Object reset because its code was updated.` at
  14:57:51.321 and 15:01:29.235 UTC. Both were recovered by Workflow replay;
  the author continued in the same Sandbox and attempt.
- These followed supervisor backend deployments during the design attempt.
  `--containers-rollout none` preserves the image but does not prevent Worker
  or Durable Object code resets. Prefer saved gates or stopped stages for all
  deployments. Keep these two occurrences in this canary's total.

#### PACK-07 — finalization uses stale review input and blocks its own correction

- Design attempt `01a0aab2-bd2c-7ace-9c62-6563802125d0` passed its final self-review
  at candidate3. Completion at 15:09:47.627 requested a disposition array for
  `[]`, from the original launch input. The current author context had two
  findings, and the author had correctly saved two responses.
- The same-session correction was then denied by the done-state hook. The
  author explicitly returned blocked; supervisor exited1 at 15:10:24.799 and
  the run reached agent_failed at 15:10:47.131. This is one causal failure;
  the hook rejection and propagated agent_execution_failed are not counted again.
- Fix: use current service-authored native context for completion. Check
  required sidecars before entering self-review. A stage retry after an accepted
  native review restores the saved patch, responses and original review identity,
  then performs output finalization only. It cannot allocate another self-review
  or change the accepted repository candidate. Original failed outputs remain.
- Recovery also needs an explicit release of the stopped failure Sandbox's
  diagnostic hold. The existing authenticated cleanup endpoint now accepts that
  request only with saved artifacts and a stopped process, preserving the failure.
- Evidence: [completion receipt](evidence/sac-172/packing-canary/design-failure-author-completion.json),
  [author's blocked result](evidence/sac-172/packing-canary/design-failure-result.json).
- Correction commit 55d2781 passed 576 repository tests and TypeScript. Worker
  661245eb-447a-4c97-9ecd-df7c690df771 activated at 100% at 15:27:02. Basic
  design pool completed rollout to image ad3aa3c3e7c01ec35ca88523451d375885131693b0af01e095940be6f1c6fced
  with four healthy instances before recovery. The existing cleanup endpoint
  returned200 and stage retry returned202 established at 15:32:59.
- New attempt 01a0aad9-9688-761d-bdda-bf3607b78b12 runs at visit13 in replacement
  instance wf-v1-vbk4ffy7gaysf3nmedbblykidgshsdj2rw7h4rhk4dfzpadaxn2q, same
  definition v39. D1 confirms the original review identity, failure-v2 manifest
  and exact saved patch hash 11d2cf885623e92dcee3c0c104a0d7493e033a10ac029ef8e5225a8854001e57.
  This is an output-finalization retry, not a new draft or earlier-stage replay.
  It completed at 15:34:41.188, about 1m40s after allocation. PR35 opened and
  independent design review began at 15:35:01.908. No new self-review ran.
  All four container rollouts are completed on the expected digest.
  [Recovery receipt](evidence/sac-172/packing-canary/design-finalization-retry.json).

#### PACK-08 — absent optional provider log recorded as an error

- Original diagnostic: `ENOENT: no such file or directory, open
  '/deos/output/provider-references.jsonl'` at 15:10:23.445 UTC.
- No provider calls is valid for an author. The supervisor already emitted an
  empty references array, but logged this expected absence as an original error.
  It now initializes the append-only log before the agent starts.
- This was not the cause of PACK-07. Count it once as recovered diagnostic noise.
- Evidence: [original error](evidence/sac-172/packing-canary/design-failure-original-errors.jsonl).

#### PACK-09 — design invents an unavailable preview delivery path

- At Human Review 15:43:31 UTC, PR35 head
  `3f18024ab76263bb37c1fce1aa7c8924f7e04391` required GitHub Actions and
  GitHub Pages. The implementation has a trusted Cloudflare Pages publisher;
  GitHub workflow publication already failed in CAL-18.
- Cause: only demo planning received runtime capabilities. Design and its
  independent reviewer lacked that context when choosing the preview host.
- Intervention 3: posted the actual publisher contract on Linear at 15:45:14
  (comment `1bbc3477-da55-4bfd-92a9-7a703cea133a`) and requested revision
  through In Progress at 15:45:15. No manual sample-repository edit occurred.
- [Original preview instructions](evidence/sac-172/packing-canary/design-preview-mismatch.json).
- The same PR was revised by 15:51:33, head
  `59478ab92e3a9b73c81ed84d5fcd9075b09c87cc`. It uses publish_preview and
  preserves the earlier accepted behavior. Independent review began 15:51:52.
- General correction: provide one frozen-policy capability description to
  planning, design, both design reviewers and demo planning. Explicitly name
  the supported publisher in that shared service context. Existing immutable
  workflow prompts and version identities are preserved. Do not add a workflow
  quality check. Local 578 tests and TypeScript passed. Source 191453e deployed as Worker
  7264560f-c6dc-490f-841a-e74404c6455c at 100% on 16:00:21 UTC. All four
  container rollouts completed to image 06ab1609f1088f11cf4b2e547826ee67b7db833307cec2423c95e2f556ae530c
  before design approval. [Read-back](evidence/sac-172/packing-canary/context-runtime-rollout.json).

#### PACK-10 — unrelated Cloudflare MCP connection requests OAuth

- Recovered startup transport errors at 15:37:32.504549 and 15:46:21.181195
  UTC, in independent design response and human design revision respectively.
  A third occurred at 15:54:41.217336 UTC in the next design response.
  Original: `Transport channel closed ... AuthRequired` for
  `https://mcp.cloudflare.com/.well-known/oauth-protected-resource/mcp`.
- All three agents continued and completed. These are three occurrences, not stopped
  stages. No credentials were added and no supervisor retry was required.
- The base image has no root Codex config. Native-review and implementation
  setup disable account apps/plugins, while these ordinary author invocations
  did not. The precise connection source is not established; inherited account
  integration discovery is a working explanation, not a proven cause.
- Apply the existing apps/plugins-disabled setting to every cloud Codex launch,
  preserving native documentation search and declared trusted tools. Verify on a
  subsequent non-native author before claiming the connection noise is fixed.
- [Original stderr](evidence/sac-172/packing-canary/unexpected-mcp-auth.json).

#### PACK-11 — human design revision restores an older draft

- Revision startup restored the 157-line original author's draft, despite a
  later completed independent-response candidate and published 183-line design.
  Observed in the live file read at 15:47:51 UTC.
- Cause: designContinuationPatch selected only design_author and
  design_revision_author node names, excluding design_independent_response.
- The author reconstructed the accepted changes from the supplied context and
  retained them in PR35. No extra supervisor action was needed beyond PACK-09.
- Select the latest completed design author by its declared design context and
  role, including response nodes and excluding reviewer or implementation
  patches. A SQLite regression exercises that ordering with all four kinds.
  Local checks passed; shipped in the same 16:00 rollout as PACK-09.
- [Restored draft read](evidence/sac-172/packing-canary/design-revision-restored-draft.json).

#### PACK-12 — current native web-search name rejected by the implementation hook

- At 16:10:34.939307 UTC, the implementation task author received
  `Tool call blocked by PreToolUse hook ... Tool: webrun`.
- Cause: the hook allowed WebSearch and web_search but omitted the current
  runtime's webrun name. The prompt and runtime skill explicitly advertise
  native research, so this is an inconsistent tool boundary.
- The same author continued through the installed OpenSpec CLI and drafted
  29 tasks. No supervisor restart or sample-app edit occurred.
- Accept the observed native tool alias while preserving restrictions on
  provider mutations and privileged file edits. All 580 repository tests pass,
  including executable hook regressions; the updated runtime skill validates.
  This container correction is pending the next safe rollout; do not interrupt
  the active agent to deploy a recovered-error fix.
- [Original rejection](evidence/sac-172/packing-canary/task-author-tool-rejections.json).

- Second occurrence: the build author received the same webrun rejection at
  16:19:03.851964 UTC and continued with the documentation broker. The build
  still uses the earlier image. [Build rejection](evidence/sac-172/packing-canary/build-tool-rejections.json).

#### PACK-13 — advertised native skill path unreadable to the author

- Build attempt 01a0ab02-47f4-7ae3-aebc-5601103899eb returned exit1:
  `cat: /root/.codex/skills/deos-implementation/SKILL.md: Permission denied`,
  observed at 16:18:27 UTC. Its next command loaded the public runtime guide.
  The same author continued; no supervisor recovery was needed.
- Cause: native skill discovery ran as root and advertised a file under the
  private Codex credential home, while every author shell runs as deos-author.
  Discovery alone did not prove the advertised file was readable by that author.
- Install the same root-owned skill at the native administrator skill location,
  /etc/codex/skills/deos-implementation/SKILL.md, mode644 under mode755
  directories. Keep the credential home private. A real pinned Linux image probe
  confirmed both native enabled-skill discovery at that path and a successful
  read as deos-author with a clean PATH. No provider/model invocation was used.
  Container syntax passes; this correction awaits the next safe rollout.
- [Original command result](evidence/sac-172/packing-canary/implementation-skill-permission.json).
- The response attempt repeated the unreadable skill access in item2, then its
  directory inspection in item4 returned permission denied. Two further failed
  shell calls, with the same known path cause; it recovered through the public
  runtime guide. [Original results](evidence/sac-172/packing-canary/response-startup-errors.json).

#### PACK-14 — documentation search assumes an optional index exists

- The build author's request to search developer.mozilla.org returned
  `First-party document fetch HTTP 404` for `/llms.txt`. Vite and Vitest index
  searches in the same shell command succeeded. The broker retained the full
  MDN HTML error body and stack; the shell command exited1.
- Cause: the broker's search action searches only an optional llms.txt document,
  but the runtime instructions did not explain that limitation. MDN's absent
  index does not mean MDN documentation is unavailable.
- The author recovered using direct official documentation URLs. Clarify the
  index limitation in the runtime skill and allow the actual native web-search
  alias (PACK-12). Do not retry a missing index or hide its original error.
- One occurrence, command item_11 in the build attempt. No supervisor recovery.
  [Complete original result](evidence/sac-172/packing-canary/build-document-search.json).

#### PACK-15 — generated dependencies included in the candidate snapshot

- The first check request failed before running npm test:
  `Unsupported candidate mode: 120000 ... node_modules/.bin/nanoid`.
- Cause: the new repository had no ignore rules for installed dependencies.
  The runtime snapshots changed source before a checked command, so Git also
  staged generated dependency symlinks. The agent added node_modules/, dist/,
  coverage/ and log patterns to .gitignore, then the same request ran normally.
- Teach authors to establish generated-directory ignore rules before installing
  dependencies. Do not broaden candidate publishing to include node_modules.
  One occurrence, command item_23; no supervisor recovery.
- [Original result and recovery](evidence/sac-172/packing-canary/build-check-repairs.json).

#### PACK-16 — local relay readiness delays and dependent connection failure

- Build item_34 returned `Isolated preview relay did not become publicly ready`;
  the same preview request, item_35, returned HTTP530, error1016. A subsequent
  local curl (item_37) failed with connection refused because startup cleanup
  had stopped the local process after the failed public relay setup.
- Three observed failed operations from one readiness/recovery sequence.
  The agent retried the same preview request; item_43 returned the existing
  origin and the browser then loaded the app successfully. No supervisor action.
- Cloudflare's relay DNS/readiness was temporarily unavailable; its underlying
  cause is not established. Original operation diagnostics remain in D1/R2.
  Static-only hosted demonstrations should not need this separate relay path
  (PACK-17). Local preview startup still cleans up after a failed setup.
- [Original results and recovery](evidence/sac-172/packing-canary/build-preview-recovery.json).
- Fourth occurrence: response attempt01a0ab38 item33 returned the same public
  relay readiness error. The same agent retried and reached a healthy local
  preview, then the hosted browser. [Response recovery](evidence/sac-172/packing-canary/response-preview-recovery.json).

#### PACK-17 — hosted browser incorrectly requires a local preview

- The static publisher succeeded and checked all three assets with HTTP200.
  Nevertheless, three hosted browser calls in item_41 returned `preview_missing:
  Start the safe preview before opening a browser`.
- Cause: the broker unconditionally required a ready local preview resource
  before it selected the requested hosted target. That made an already deployed
  app depend on an unrelated local process and tunnel.
- Require the local resource only for local browser commands. Allocate a hosted
  session directly from the run's published URL, and preserve that session's
  allowed origins if a local allocation is later added or fails. A regression
  runs the real broker, allocator and D1 store with provider I/O replaced: hosted
  navigation works without a Sandbox, reuses its browser after a failed local
  allocation, and local requests still reject an unready local resource.
- Three occurrences. The active author recovered the local relay itself and
  continued with the hosted browser. General correction awaits the safe rollout.
- [Original calls](evidence/sac-172/packing-canary/build-preview-recovery.json).

#### PACK-18 — browser fill types into an existing value

- Three demo collections timed out waiting for the renamed Jacket row, at
  16:40:16.978, 16:43:15.448 and 16:44:55.465 UTC. The first was initially
  recorded as APP-05 and attributed to Enter not submitting. That diagnosis
  was premature: changing the keyboard handler and then using Save still failed.
- The real cloud page state at 16:45 showed `Rain coatJacket`. The app had saved
  exactly the value entered by the harness. DEOS implemented fill with
  Puppeteer Page.type, which inserts text rather than replacing the field value.
  Sol found the cause itself and adjusted its scenario to select existing text
  first. No supervisor app edit or live scenario edit was made.
- Replace the runtime fill operation with the library's fill API. The pinned
  library clears an empty string without an input event, so clearing a text field
  uses selection and a real Backspace event to notify controlled inputs.
- A real external Brave regression using the pinned Cloudflare Puppeteer and
  actual browserCommand failed before the patch (JacketRain coat instead of
  Jacket), then passed replacement, Enter submission and empty input events
  across separate connections. This is local runtime proof, not a claim that
  the active cloud run has received the fix. Deployment is pending a safe pause.
- [Original cloud failures, state and agent recovery](evidence/sac-172/packing-canary/build-demo-runtime-failures.json).
  [Real browser regression](evidence/sac-172/packing-canary/browser-fill-regression.json).

#### PACK-19 — browser tool socket closes during a collection

- At 16:46:17.193 UTC, collection33bc5ccc stopped in the rename scenario while
  adding Socks with `fetch failed`. The agent reported a socket close and retried
  the same saved scenario list from zero without editing the app or harness.
- One observed failed operation so far. The underlying socket failure is not
  yet established; retain the complete error and cause rather than guessing.
  No supervisor restart. [Original journal](evidence/sac-172/packing-canary/build-demo-runtime-failures.json).

#### PACK-20 — unavailable image compositor invoked during inspection

- One shell command invoked montage three times after its tool lookup found
  neither montage nor magick. All three invocations returned command not found;
  a final directory listing made the overall shell result exit0.
- Three failed tool invocations, observed at 16:51:42 UTC. No capture was changed
  and the completed browser collection remained intact. Sol proceeded to inspect
  original images. Native view_image is the supported inspection path; the
  runtime skill now states this instead of inviting an assumed compositor.
- [Original shell result](evidence/sac-172/packing-canary/build-image-inspection-tool.json).

#### PACK-21 — hosted shell reachability checks returned HTTP 520

- Build items78 and80 each ran the same curl command against the immutable
  hosted preview; curl returned exit22 and HTTP520. The outer tool exited zero
  while preserving the inner failure, so monitoring must read the actual result.
- Browser scenarios and publisher asset read-back reported HTTP200. Sol retained
  the shell failures and used its local server for the shell demonstration.
- The configured sandbox host allowlist excludes this Pages host. That is
  consistent with an egress restriction, but the original 520 lacks a cause body,
  so the exact provider failure remains unproven. Do not claim an app outage or
  label it a transient provider failure based on this result alone.
- Runtime guidance now distinguishes hosted browser/publisher access from shell
  access. No new provider permissions or supervisor application edits were made.
- [Original results](evidence/sac-172/packing-canary/build-hosted-shell-and-scratch.json).
- Third occurrence: response item37 retried shell HEAD against the registered
  review alias and returned exit22 / HTTP520. It kept this as diagnostic work
  and switched to the service browser, which returned HTTP200 with a clean
  console. [Original result and browser recovery](evidence/sac-172/packing-canary/response-preview-recovery.json).

#### PACK-22 — preview scratch entered the implementation snapshot

- Sol's final audit found an untracked `.wrangler/` directory inside the app
  repository. The preview launcher used the repository as its current directory,
  despite already preparing a separate runtime scratch directory.
- Sol removed the generated files and added an ignore rule. It then republished
  and repeated all six scenarios solely to match the cleaned repository tree;
  its own transcript and publication receipts state that served assets were
  unchanged. This was an agent decision, not a workflow rejection.
- One contamination occurrence, with avoidable recapture as its consequence.
  The repeated collection ran from about 16:55 to 16:59:05 UTC and returned
  23 screenshots. No supervisor changed the app, scenario list, or proof.
- The runtime now launches Wrangler from its prepared scratch directory while
  keeping app entrypoints and assets absolute. Guidance says metadata and scratch
  cleanup alone do not require repeating unchanged demonstrations. Pending rollout.
- The pinned Linux container probe reproduced `.wrangler` in the repository
  before the change and no repository scratch after it, with HTTP200 in both
  cases. [Executable probe](evidence/sac-172/packing-canary/preview-cwd-probe.mjs),
  [results](evidence/sac-172/packing-canary/preview-cwd-probe.json).
- [Original audit and recapture](evidence/sac-172/packing-canary/build-hosted-shell-and-scratch.json).

#### PACK-23 — interrupted check clients left work blocking the queue

- After the final screenshots, Sol's repeated local Showboat command stalled.
  Sol interrupted item93, then tried another check/status call (item95), which
  also stalled and was interrupted. Both clients returned exit130. Two failed
  calls; the second shared the blocked command queue rather than starting a new
  independent browser or app failure.
- The local server's initial lack of response is not established. The runtime
  detached check processes and did not cancel them when the client disconnected.
  Later requests and finalization wait for that command queue to drain, bounded
  by the command's existing ten-minute deadline. The agent had returned its
  final completion by the 17:05:21 read while the runtime remained running.
- Correction: check and Showboat subprocesses now stop as a group when their
  client closes before a result. Cancellation keeps the original cause and
  stdout/stderr in the existing durable error path. Successful commands retain
  normal behavior. Runtime guidance also bounds network probes explicitly.
- Real HTTP disconnect and normal-response regression tests pass; all 584
  repository tests and TypeScript pass. Pending safe rollout. No supervisor
  interrupted the cloud process or edited application code to recover it.
- The original command eventually returned `Command timed out: showboat` with
  SIGKILL; the abandoned queued request recorded `aborted` / ECONNRESET.
  These are the outcomes of the same two interrupted calls, not extra failures.
  Build finalization completed at 17:09:25 and advanced normally to Claude.
- [Original commands and completion](evidence/sac-172/packing-canary/build-command-interruption.json).

#### PACK-24 — hosted navigation resets and dependent browser calls

- Final durable transcript audit recovered five earlier failed operations that
  the compact progress snapshots omitted. These occurred before the first demo,
  not during Claude review.
- Item44: hosted navigation returned `net::ERR_CONNECTION_RESET`; its shell then
  issued viewport and state requests, both refused because navigation had not
  completed. Item45 repeated navigation and returned the same connection reset.
  Item46 substituted the immutable deployment URL, which the browser refused as
  outside its assigned review-alias origin.
- Two transport failures, two dependent calls after failed navigation, and one
  unsupported origin substitution. The connection-reset cause is unknown. Sol
  continued through the local preview and later completed hosted navigation and
  all scenarios. No supervisor recovery occurred.
- Runtime guidance now says to use `target: "hosted", url: "/"` for assigned
  routing and await successful navigation before other exploratory operations.
  The immutable URL remains suitable for the human review link. No origin
  restrictions were broadened or provider retries added.
- [Original calls and recovery](evidence/sac-172/packing-canary/build-navigation-recovery.json).

#### PACK-25 — browser close accepted before absence was confirmed

- Build cleanup at 17:09:27 returned `Browser close is not yet confirmed`.
  The aggregate cleanup error and its outer sandbox-destruction wrapper were
  saved as two workflow_errors records. They describe one failed browser cleanup
  operation, not two independent failures. The completed build still advanced.
- The existing scheduled reconciler recovered it: D1 recorded the browser as
  destroyed with an absence receipt at 17:16:23.797. Preview relay cleanup also
  completed. No supervisor resource mutation or stage restart was needed.
- Existing browser cleanup tests cover this delayed-absence path. This is a
  recovered provider lifecycle incident; no speculative new retry was added.
- [Original causes and durable recovery](evidence/sac-172/packing-canary/build-cleanup-recovery.json).

#### PACK-26 — checks started before restoring dependencies

- The response sandbox restored source but not node_modules. In item15, npm test
  returned exit127 (`vitest: not found`), and npm run build returned exit127
  (`tsc: not found`). These are two setup failures, not app assertions or defects.
- Sol then installed the lockfile dependencies with npm ci. Runtime guidance
  explicitly says to check tools and restore dependencies before tests/builds.
- [Original calls](evidence/sac-172/packing-canary/response-command-recovery.json).

#### PACK-27 — duplicate test runs were interrupted during diagnosis

- With a checked suite still running, Sol launched another checked call and a
  direct npm test/build command. It later stopped processes and switched to one
  Vitest worker with file parallelism disabled. Items22 and23 returned exit143;
  the direct output contained passing assertions followed by Terminated.
- Two interrupted calls observed so far. Do not infer failing application
  assertions or a provider capacity limit from these terminations. Sol owns the
  suite and its recovery; the supervisor made no test/config/code changes.
- The runtime guide now says to keep one suite active, inspect or stop its
  existing execution, and use the runner's concurrency controls when appropriate.
- [Original calls](evidence/sac-172/packing-canary/response-command-recovery.json).

#### PACK-28 — checked shell browser calls deadlock on their enclosing queue

- Response item40 wrapped browser requests in a reviewer Showboat command. The
  check held the runtime tool queue while its subprocess waited for a browser
  request on that same queue. The agent interrupted the client (exit130), but
  the deployed runtime left its child processes alive. A following Showboat
  waited behind it for over five minutes.
- Sol inspected the processes and stopped that exact child chain in item45.
  The next Showboat then completed successfully with the trusted hosted receipt.
  One failed call; the waiting successful call and later aborted wrapper are
  consequences, not additional occurrences. No supervisor process mutation.
- Correction: serialize checks separately from browser tools. Whole demo lists
  and raw browser calls still share one queue. Finalization waits for incoming
  requests and both queues. The existing pending client-cancellation fix also
  stops abandoned process groups. This adds no quality gate or verdict check.
- A real subprocess/HTTP regression proves a check can await a browser request
  while a second check remains serialized. Demo-interleaving regression still
  passes. All 588 repository tests, TypeScript and skill validation pass.
- [Original calls and recovery](evidence/sac-172/packing-canary/response-nested-browser-command.json).

#### PACK-29 — one progress notification timed out

- The response progress watcher recorded `The operation was aborted due to
  timeout` at 17:17:09.745, including the original notify stack. This was found
  in the full reader capture, not the compact command tail.
- One signal delivery failure. Later D1 heartbeats and the final stage transition
  were received; it did not stop implementation. The exact network cause is
  unknown. Retain the existing fallback rather than inventing another workflow.
- [Original diagnostic](evidence/sac-172/packing-canary/response-progress-signal-timeout.json).

#### PACK-30 — browser target closed and could not reconnect

- The response collection passed its add scenario, then stopped at 17:41:42.656
  while waiting for the renamed packed row: `Protocol error
  (Runtime.callFunctionOn): Target closed`. Two subsequent collection resets at
  17:41:59.688 and 17:42:20.813 could not connect to the assigned session, with
  `Cannot read properties of null (reading 'accept')`. Three failed operations.
- Sol changed its own scenario from Enter to Save and retried the saved list.
  Its claim that Enter caused the closure is unproven. The earlier deployed fill
  defect also remained present, and this reconstructed scenario omitted the
  prior select-all workaround. The exact cause of session closure is unknown.
- Sol returned needs_human; the attempt finished at 17:43:03.330 with source,
  candidate and original diagnostics saved. DEOS posted its concrete browser
  recovery question on Linear and reached clarification wait visit35. No second
  Claude review or supervisor application edit occurred.
- Runtime commit32745bc is deployed: Worker6f4ba465 at100% and all four container
  pools completed on image6f552ca4 with healthy instances. The supervisor replied
  to the existing Linear question at17:53:20.341, authorizing same-stage recovery
  with saved code and a fresh assigned browser. This is intervention4, not an
  unattended recovery. D1 confirms the answer was consumed and a new build attempt
  started at17:53:49.965 at visit37, preserving the same run and its earlier
  completed stages. No implementation approval or release was authorized.
- [Original scenarios, failures and handoff](evidence/sac-172/packing-canary/response-browser-retired.json).
- Follow-up on17September: provider history now confirms `BrowserSessionEvicted`,
  close reason11. The earlier unknown-cause note and Enter hypothesis are superseded
  by the [provider receipt](evidence/sac-172/packing-canary/original-browser-eviction.json).

#### PACK-31 — published proof images missing in GitHub mobile

- On 2026-09-17 the user reported that images did not display in PR36 and
  identified the GitHub mobile app as the viewer. Count one publication failure
  affecting the gallery, not 17 independent capture failures. Desktop Brave
  still loaded all 17 images; the image files were intact and public.
- GitHub's live REST body_html returned each img src as `../blob/...`, unchanged
  from the publisher. This depends on a repository page base URL. The direct
  raw image returned HTTP200 image/png without authentication or a redirect.
  The mobile renderer itself was not available for inspection; the observed
  relative URL contract is the addressed portability defect.
- Source 5ddb411 emits full commit-pinned raw URLs for public repositories and
  preserves GitHub's authenticated image behavior for private repositories.
  Generated capture provenance is removed from public captions, while original
  records stay in diagnostics. New proof manifests use version3 so regenerated
  Showboat documents receive that caption correction.
- The maintenance script regenerated only the known published gallery with the
  shared publisher functions. It retained every selected image, its proof commit
  and the implementation head, checked for concurrent PR edits, and updated the
  existing body. No app agent, scenario, code change, merge or workflow restart.
  This is supervisor recovery intervention5, not unattended success.
- Validation: public/private publisher regressions; full suite 588 passed,
  1 skipped, zero failed; TypeScript passed. Read-back of PR36's API HTML has
  17 absolute image URLs. All 16 distinct URLs return anonymous HTTP200 image/png
  without redirects; all 17 image elements render at1440x900 in external Brave.
  On 2026-09-17 the user confirmed the repair in GitHub mobile: "good now works".
  PACK-31 is resolved with confirmation from the affected viewer. Keep the
  original failure and supervisor intervention in the run totals.
- Worker6af4b501-e84b-4254-924d-d92576dc290e deployed without a container rollout.
  [Repair receipt and verification](evidence/sac-172/packing-canary/mobile-image-repair.json).

### App development failures recovered by the implementation agent

These are recorded for completeness, separately from platform/tool failures and
operator interventions. Count failed command executions, not each assertion or
compiler diagnostic within one execution. Intentional negative-case assertions
that pass are not failures. All occurred in build attempt
01a0ab02-47f4-7ae3-aebc-5601103899eb.

| ID | Failed command | Observed failure | Recovery |
| --- | --- | --- | --- |
| APP-01 | npm test, item_25 | Two failed behavior tests and unhandled focus errors: packing a row referenced an absent control; explicit recovery-copy replacement retained the older rejected value | Sol repaired the app; the subsequent run passed all 36 tests |
| APP-02 | npm run build, item_27 | Vite/Node type setup and Web Crypto type declarations did not compile | Sol installed Node types and corrected compiler and type declarations |
| APP-03 | npm run build, item_30 | Crypto.getRandomValues did not satisfy the app's CryptoSource signature | Sol matched the browser API generic signature |
| APP-04 | npm run build, item_31 | Test CryptoSource implementation cast generic ArrayBufferView directly to Uint8Array | Sol corrected the test cast; item_32 passed TypeScript and the production build |
| APP-05 (reclassified) | First hosted rename failure | Initially attributed to the app's Enter handler; the later real page state established the runtime fill defect | Counted under PACK-18, not as an additional app failure; original diagnosis retained |

[Original command results and repairs](evidence/sac-172/packing-canary/build-check-repairs.json).

[First browser collection failure and response](evidence/sac-172/packing-canary/build-demo-rename-failure.json).

### Supervisor and measurement notes

- The resumed author preserved the application and immutable deployment. Its
  single collection459b5d7f completed all six scenarios at18:08:02.164 with
  23screenshots, including replacement rename, persistence and clearing invalid
  input. This exercised the updated browser fill through the real hosted app.
  The full live transcript/diagnostic audit through18:09:51 found no new failure.
  Sol reported inspecting all captures and selected 17 images plus one successful
  Showboat receipt. PR36 opened at 18:11:37 UTC; D1 reached implementation_review,
  awaiting_human, visit41 at 18:11:42.796. Linear also reports Human Review and
  links PR36. The final resumed attempt lasted 17m06s. Its durable transcript and
  diagnostics were hash-verified: all 14 command executions exited zero and all
  six scenarios completed without a new diagnostic failure. Earlier errors
  printed from saved input are retained history, not new occurrences.
  External Brave loaded the immutable preview and all 17 PR image elements at
  1440x900. This confirms rendering, not an independent verdict on every caption.
  The monitor is paused and its temporary live reader stopped at this endpoint.
  [Final outcome](evidence/sac-172/packing-canary/final-outcome.json).
  [Original milestones and capture results](evidence/sac-172/packing-canary/recovery-demo-completed.json).

- The presentation finding about repeated hosted URLs and internal registration
  hashes was corrected in the general publisher and PR36's gallery during
  PACK-31 recovery. The original proof branch and diagnostic records remain.
  No recapture or application edit was needed.

- The final response transcript and diagnostics were fetched from their durable
  artifact keys and verified against SHA256. Audit found no additional failed
  command occurrences beyond the recorded66. The inner exit143 for the nested
  browser check is the outcome of item40, not a second failure. [Artifact index](evidence/sac-172/packing-canary/response-final-artifacts.json).

- Source32745bc and earlier pending corrections are now deployed, including
  readable skill discovery, native search alias, hosted browser access without
  a local tunnel, replacement fill, scratch isolation, command cancellation,
  ordered proof selection and separate check/browser queues. The existing
  Workflow instance still executes its frozen code; the resumed attempt gets
  the new container and current broker endpoints. [Deployment read-back](evidence/sac-172/packing-canary/harness-rollout.json),
  [validation](evidence/sac-172/packing-canary/harness-validation.json),
  [recovery reply](evidence/sac-172/packing-canary/browser-recovery-reply.md).

- The first operator deployment read-back returned HTTP404 during the rolling
  update. A new read succeeded and showed progressing pools; later reads showed
  all four completed and healthy. This read-only operator incident is separate
  from the cloud canary's failed-operation count. No deployment was repeated.

- Claude's evidence feedback exposed a publishing limitation: authors could mark
  a Showboat record for review but could not later deselect it. The harness now
  offers status proof IDs and an explicit select_proof action. Only the author's
  chosen records go to the candidate, in the chosen order; original records stay
  in diagnostics. This adds no quality verdict or completion check. Source tests
  cover ordering, original preservation, invalid tool input recovery and legacy
  behavior; the subsequent 588-test validation and safe rollout are recorded
  above. The final resumed agent used select_proof successfully. This capability gap is
  a review finding, separate from observed failed-operation counts.

- The implementation author bulk-marked task checkboxes before demonstrations
  finished. The task counter therefore cannot be treated as proof completion.
  Runtime instructions now require incremental updates and keeping demo/handoff
  tasks open until finished. Progress reports use the live demo journal as well.

- Static publication returned `static_preview_pending` while Cloudflare's
  deployment was queued, then the same request read back success. This is an
  expected asynchronous provider state, excluded from unexpected failure counts.
  The original pending result is retained alongside the preview recovery evidence.

- The local skill validator initially used a Python without PyYAML and returned
  ModuleNotFoundError. Use the repository's uv environment. This is an operator
  tool setup error, excluded from cloud canary counts. The validator passed with
  `uv run --with pyyaml python .../quick_validate.py container/skills/deos-implementation`.

- Two diagnostic search commands in the response/revision returned exit1 with
  no output because their final `rg --files -g AGENTS.md` had no match. The
  agent explicitly recorded that optional repository guidance was absent. This
  expected search result is not counted as a runtime failure.
  [Raw results](evidence/sac-172/packing-canary/expected-search-no-match.json).

- 2026-09-16 before trigger: the first read-only preflight query used nonexistent
  `agent_attempts.status`; D1 returned `no such column: status`. Corrected the
  query after schema inspection (`state` is the field). No mutation or run
  impact. This is an operator query error, excluded from workflow counts.
- Several local lookup commands used stale file paths/globs. Corrected by file
  discovery; no effect on the cloud run. Keep operator mistakes separate from
  unattended workflow defects.
- Calculator closure is user-authorized canary retirement, not an implementation
  merge or a release. Its original PR, images and failure evidence remain.
- CAL-22 recovery: first paused the old instance. Preserved provider step
  records and verified D1's gate65 had no active attempt. Restarted only the
  Cloudflare engine; DEOS loaded the same saved gate, not earlier agents. Moved
  the issue back through Human Review at 14:53:23.925 and Canceled at
  14:53:34.054. D1 then recorded canceled visit66. This is a calculator
  retirement intervention, excluded from SAC-238's count.
- A token-protected temporary Wrangler preview reads the currently running
  canary's transcripts. It performs no code edits, process launches, restarts or
  provider actions. This is observation, not a recovery intervention. It expires
  on 2026-09-17 and must be stopped when monitoring ends.

## Packing canary retirement, 2026-09-17

The user retired SAC-238 after it served its test purpose. Preflight D1 showed implementation Human Review at visit41 with no active packing attempt. PR36 was closed unmerged, and Linear moved to Canceled at 05:36:45.564 UTC. The old packing monitor was already paused. Historical proof and failure counts are preserved. Expense canary SAC-243 continues independently. This is authorized retirement, not an application failure.

D1 confirmed normal cancellation at visit42 by 05:37 UTC, with no remaining active packing attempt. No retry or workflow repair was needed. Saved read-back: [retirement](evidence/sac-172/packing-canary/retirement-20260917.json).

### SAC-243 handoff correction rollout

EXP-03: cloud design response completed from its retained context and reached gate16 at06:07:55.335UTC without supervisor artifact edits. Workflow-only fix243ed25 passed594tests (1skip), TypeScript, and the regression that failed against the actual durable job shape before correction. At06:13:01UTC, with no active attempt, backend f60fbeb7-2671-4a71-bd04-c71129d53ef3 activated at100%; containers were not rebuilt. Current response predates this deployment, so live restoration of a later design patch remains unproven. Revised PR38 head10ac345f9ea7a1da32999bc1ae4e8e0b8c8a68d1 reviewed and approved through Linear.

06:14 UTC: design approval delivery04d418c4-f69f-45a7-ad71-a63992dd403f consumed normally at06:14:01.236. PR38 merged06:14:06, commitd863ba43593da153f35e35b9c3ebbbc578f63bf6. Implementation task generation attempt01a0ae00-792f-77a0-b7b3-11bd296cfe18 starting. No approval resend or stage restart needed.

### SAC-243 initial implementation checks, 06:37 UTC

Evidence: [original commands and check output](evidence/sac-172/expense-canary/initial-build-failures.json). Cloud author remains active; no supervisor app edits or recovery action.

- EXP-04: at06:35:41 `npm ls --depth=0` exited1 with `ELSPROBLEMS`, invalid jsdom and extraneous dependencies. Dependency installation was incomplete at inspection; exact scheduling cause not yet established. Subsequent Vitest execution ran; outcome pending final transcript audit.
- EXP-05: author attempted to tail protected `/deos/output/implementation-diagnostics.jsonl` and received `Permission denied` (item41). The trusted check response already retains test output. One agent-tool access failure; no permission change made.
- APP-01: first `npm test` at06:36:20 found the storage conflict result had `ok: true` instead of `ok: false`. Object spread after the explicit false flag overwrote it. Cloud author owns repair.
- APP-02: same test run could not load the app suite: `TypeError: The URL must be of scheme file` at tests/app.test.js:6. Test fixture URL construction conflicts with the test environment. Cloud author owns repair. These two app development failures are separate from workflow/tool counts.

### SAC-243 build progression, 06:43 UTC

[Additional original check and tool output](evidence/sac-172/expense-canary/build-failures-0643.json). Both app causes were repaired by Sol, with57tests passing at06:40:36 and a successful static build. APP-01 occurred in3test executions (06:36:20,06:37:11,06:37:47); APP-02 occurred in6executions (those3plus06:38:35,06:39:14,06:40:04). Count9app failure occurrences across2causes, not separate outer command wrappers. No supervisor app edits.

- EXP-06: local preview relay failed to become publicly ready (item55), then same-relay reconciliation returned HTTP530, code1016 (item56). Two occurrences. Local app returned HTTP200 meanwhile. DNS/provider root cause remains unknown; no deployment or runtime reset performed.
- EXP-07: browser navigation, viewport and state requests (items59,60,61) each returned `preview_missing: Start the safe preview before opening a browser` after the pending relay. Three occurrences. Agent is still active and owns the choice to reconcile or use the already-supported hosted preview. No supervisor intervention yet.

06:50UTC outcome for EXP-06/07: Sol used the supported hosted publisher without supervisor intervention. All6static assets read back HTTP200 and exploratory service-browser checks worked at1440x900. Ordered9-scenario demonstration collection is next; local relay root cause remains unknown.

- EXP-08: hosted publication followed by same-request readback (items63/64) each returned `static_preview_pending` because `allowlist-probe.html` returned HTTP308. Two occurrences, one URL/readback compatibility cause. Sol adjusted the static output and obtained a new successful hosted revision. No supervisor intervention. Evidence: [original errors](evidence/sac-172/expense-canary/hosted-redirect-failures.json).

### SAC-243 duplicate demo collection, 07:08 UTC

EXP-09: author launched the same final-demo.json twice (items86and89) while the first collection was running. The second local client was stopped (exit143), but its queued server request later began collection6a854ca0-c75d-4e47-8345-dd5b4ec4bf78 immediately after the original nine-scenario collectionc27eb892-6e37-4103-9e85-89824680a5e5 finished at07:07:56. All nine original scenarios completed. One duplicate-submission/canceled-client queue occurrence; original evidence remains intact. No supervisor interruption or deployment during the active attempt. Record final outcome and distinguish repeated proof work from a second app failure. [Original command and collection evidence](evidence/sac-172/expense-canary/duplicate-demo-queue.json).

07:20 UTC outcome for EXP-09: the duplicate collection completed all nine scenarios at07:19:58.442 without supervisor interruption. It consumed about12additional minutes after the original collection. The author resumed evidence inspection. This is repeated proof work, not another application failure; cancellation/idempotency behavior remains unrepaired.

### SAC-243 evidence output recovery, 07:29 UTC

- EXP-10: original-errors.jsonl retains two progress-signal TimeoutError occurrences at06:24:46.738 and06:55:47.612: `The operation was aborted due to timeout`, in implementation-progress-watcher.mjs notify. Provider/network cause unknown. D1 progress continues updating through07:28:21; no supervisor retry or deployment.
- EXP-11: after completed captures, status returned proof IDs/captions but no image paths; filesystem search found no readable image files. Author reports losing the original response when its shell yielded (item273). Exact output-loss mechanism remains unverified. At07:21 it deliberately launched a third identical collection with stdout saved to final-demo-output.json to recover inspectable paths. This is one evidence-retrieval failure and agent recovery, distinct from EXP-09's accidental duplicate. Frozen app/scenarios unchanged; six scenarios completed by07:29, result pending. No supervisor app edits or interruption. [Original evidence](evidence/sac-172/expense-canary/evidence-path-recapture.json).
- Operator-only: local audit assumed every transcript item ID ended in a number and raised ValueError on exec-bfab2195-5848-4a17-93c2-4334e80bbde0. Corrected to filter numeric item IDs; no remote effect and excluded from cloud counts.

### SAC-243 causal audit of task6.2 delay

EXP-09/11 clarification: transcript items88/93 show the author mistook shell yields for completion with missing output, then resubmitted before checking the original process. implementationRequestQueue in container/implementation-browser-demo.mjs routes every non-check request, including status, behind the entire demo. Thus status could not report the active collection while the author waited. The queue has no request identity deduplication, and the runtime request handler does not cancel queued work on client disconnect. Killing the duplicate client did not retract it.

Screenshot bytes were not lost: step_completed diagnostics already contained imagePath values under /deos/implementation/browser-<sha>.png from the original collection. browserResult writes them locally; finishBrowserDemo retains only capture.proof, and status projects IDs/kind/caption/audience/selection without imagePath. The author therefore had no status-based rediscovery path. ROOT is protected (0700 initially,0711 when local preview starts), so recursive author find cannot list it; the diagnostics file is also protected. A third capture was an unnecessary recovery choice for existing evidence, enabled by this incomplete result-retrieval contract. Do not call the screenshot data lost. [Transcript and original image-path evidence](evidence/sac-172/expense-canary/demo-delay-causes.json).

Repair direction: independently readable collection status, stable request identity with explicit rerun semantics, durable retrievable completed results and author-readable proof manifest. Do not loosen access to private runtime state. No runtime deployment during active work. Supervisor earlier reporting described repetition without tracing these causes; this audit corrects that gap.

07:40UTC outcome for EXP-11: third collection completed07:33:42.613, saved response contained23image paths, and author inspected captures and selected15images plus1Showboat. Build reached23/23tasks at07:36:18.609 and advanced to Claude review. No supervisor recovery intervention. Completed artifact audit confirms existing command errors; process absence probes and deliberately terminated polling clients remain excluded from independent failure counts. Full raw artifacts retained privately with verified hashes.

### SAC-243 final artifact audit and endpoint, 07:50 UTC

- EXP-04 additional occurrence: item34 npm test returned inner exit127, `sh: 1: vitest: not found`, even though the tool wrapper returned success. Transcript ordering shows npm install item32 completed after the test and npm ls item36; the agent tested before installation finished. Count2dependency-readiness occurrences for EXP-04. Agent reinstalled and recovered without supervisor changes.
- EXP-12: at06:28:37.743746 the author attempted a native patch tool despite runtime instructions. PreToolUse rejected it with: `Edit repository and request files through the shell with Python, Node, cat or tee. Native patch tools and an apply_patch shell executable are not provided.` One agent-tool selection occurrence. Author used supported shell file writes afterward; no protection was relaxed. [Original diagnostic additions](evidence/sac-172/expense-canary/final-audit-additions.json).

Observed totals at the implementation-PR endpoint:18workflow/tool failure occurrences across12categories (EXP-01..12);9app test-failure occurrences across2causes. These include recovered errors and exclude deliberate negative tests, terminated polling clients, absent completed processes, quality findings and local operator mistakes. Reviewer's nonblocking evidence-density observations are separate. No stage restart, manual app edit, or replacement demo by supervisor. One workflow-only handoff fix was deployed at a stopped design gate, after that response had already recovered itself; it is not proof the current response used the fix.

Claude returned pass. It verified all6hosted asset hashes match candidate files and inspected the15selected screenshots; no author-response stage was needed. Nonblocking findings: Showboat contains a Node behavior script rather than planned browser measure records, and selected evidence omits some intermediate checkpoints whose outcomes appear later. [Exact review result](evidence/sac-172/expense-canary/claude-review-result.json).

PR39 is open, ready for review, unmerged at d619fc9c5b810e6aa5482cbe23cb64b076d990c8. Linear Human Review since07:45:45.350. D1 implementation_review with no active attempts or workflow_errors. Browser inspection in external Brave confirmed live preview and PR images; all15public PNG URLs returned200 with matching content hashes.57app tests, static build and strict OpenSpec checks passed in the cloud. Preview warning says built before latest changes because task checkboxes changed; Claude's6asset hash comparison establishes matching app content. Do not claim production release.

Remaining reliability work: status blocked by demos, duplicate request reconciliation and result retrieval; local preview DNS cause; recovered progress-notification timeouts. D1 implementation try also retains public_error_code=implementation_failed despite completed status; this is a diagnostic inconsistency, not another observed execution failure. These remain noted, not fixed by this canary. Monitoring paused and temporary read-only reader stopped. This is supervised endpoint success, not proof of unattended reliability.


### SAC-243 post-canary repairs and retirement, 2026-09-17

PR39 closed unmerged and SAC-243 canceled at user request; D1 confirms canceled with no active attempts. Retirement receipt: evidence/sac-172/expense-canary/retirement.json.

EXP-09/11: added stable check/demo operation IDs, independent status reads, persisted receipts and completed result retrieval including image paths. Repeating the same ID reconciles existing work; changed input is rejected. Closing a client does not cancel work. Explicit cancellation is supported for queued work and running commands; running browser demos remain inspectable rather than being ambiguously replayed. Runtime restart marks unfinished receipts interrupted.

EXP-04/12: CLI now exposes pending exit75, waits by polling the same operation, returns command failure exit codes, and supports successful dependency receipts before starting dependent commands. Existing editing inventory and enforcement remain; CLI help repeats the actual supported tools. Native model tool schemas were not altered.

Hosted proof verification follows at most three same-origin public asset redirects and still requires exact content hashes. Completed implementation checkpoints clear the current public failure code while retaining original diagnostic manifests and immutable effect errors.

Progress notification timeout remains3seconds with transient retries1–30seconds; separate supervisor heartbeat is30seconds with configured5minute expiry. Recovered network failures are expected, not evidence of broken recovery. Last activity and deadlines aid diagnosis but do not prove semantic progress or automatically restart quiet operations.

Validation: full suite601tests,600pass,1skip; typecheck and whitespace checks pass. Local HTTP disconnect/dedup/status/restart tests and real child-process failure/dependency/cancellation tests pass. These are regression checks, not a new provider-originated canary. Deployment activation is recorded separately after rollout.

Repairs activated: Worker `8027527b-c89b-4cbd-8c57-dc98793964e6` at100percent, all four container pools on `b14f001b65b1c6f82033d3f89fc8f01ba3fb30bccb05f470dfe37f70ac78e83f`, four healthy instances each, completed rollouts with no health errors. Final source9262871 includes hosted-only proof path traversal. No active attempts were interrupted. [Activation receipt](evidence/sac-172/expense-canary/operation-repairs-activation.json); [validation and proposed next canary](evidence/sac-172/expense-canary/operation-repairs.md).
