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
| [SAC-225](https://linear.app/sachinkundu/issue/SAC-225/build-a-simple-web-calculator) | Calculator, desktop and mobile | Retrospective; incomplete occurrence counts | Multiple; historical categories below, exact total unknown | Multiple; exact total unknown | Reached [PR33](https://github.com/sachinkundu/deos-sample-project/pull/33) with supervision; PR closed unmerged, issue and workflow Canceled on 2026-09-16; retirement recovery recorded as CAL-22 |
| [SAC-238](https://linear.app/sachinkundu/issue/SAC-238/build-a-desktop-packing-list-web-app) | Desktop packing list; no mobile | Prospective from first trigger, 2026-09-16 14:06:26 UTC | 20 occurrences in 11 categories, including recovered errors and one stopped author stage | 3 recovery interventions: resent approval, resumed design finalization, requested preview-path revision | Proposal/specification PR34 merged; design PR35 revised and under independent review; implementation PR pending |

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
- The same PR was revised by 15:51:33, head
  `59478ab92e3a9b73c81ed84d5fcd9075b09c87cc`. It uses publish_preview and
  preserves the earlier accepted behavior. Independent review began 15:51:52.
- General correction: provide one frozen-policy capability description to
  planning, design, both design reviewers and demo planning. Explicitly name
  the supported publisher in author/reviewer instructions. Do not add a workflow
  quality check. Local 577 tests and TypeScript passed; deployment pending.

#### PACK-10 — unrelated Cloudflare MCP connection requests OAuth

- Recovered startup transport errors at 15:37:32.504549 and 15:46:21.181195
  UTC, in independent design response and human design revision respectively.
  Original: `Transport channel closed ... AuthRequired` for
  `https://mcp.cloudflare.com/.well-known/oauth-protected-resource/mcp`.
- Both agents continued and completed. These are two occurrences, not stopped
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
  Local checks passed; deployment pending.
- [Restored draft read](evidence/sac-172/packing-canary/design-revision-restored-draft.json).

### Supervisor and measurement notes

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
