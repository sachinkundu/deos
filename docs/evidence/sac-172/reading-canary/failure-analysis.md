# SAC-245 failure analysis — 17 September 2026

The reading-queue canary reached [implementation PR 42](https://github.com/sachinkundu/deos-sample-project/pull/42), with a working hosted preview, 31 passing cloud tests and 13 published images. It needed one supervisor repair episode: fix the frozen-source review reader, deploy the workflow change, and retry the saved review. Cloudflare agents authored all application code and proof.

The previous operation-management repairs worked in this run. New review-tool trouble and repeated preview setup kept this from being an unattended success. The total time to Human Review was almost unchanged from the expense canary.

This is a historical analysis through the implementation gate at 11:38:52 UTC, with cleanup evidence through 11:46:23. It does not advance the PR or infer any later human decision. No runtime or application change was made during this analysis.

## Counts and comparison

| Measure | SAC-243 expense tracker | SAC-245 reading queue |
| --- | --- | --- |
| Real Linear trigger to implementation Human Review | 2h 20m 28s | 2h 23m 16s |
| Recorded workflow/tool events, including discovery misses | 18 in 12 problem categories | 21 in 15 problem categories |
| Application test-failure occurrences observed | 9 across 2 causes | 0; 31 tests passed |
| Initial implementation attempt | 1h 14m 15s | 37m 39s |
| Duplicate or result-retrieval-driven final demo reruns | 2 extra collections | 0 |
| Independent implementation review | Pass, with nonblocking evidence notes | Reader failed; resumed review requested better proof |
| Supervisor workflow deployment | 1 handoff fix, after the affected stage recovered | 1 reader fix, necessary to resume review |
| Supervisor saved-stage retry | 0 | 1 |
| Local supervisor application edits | 0 | 0 |

These are observations from different small apps, not a controlled performance benchmark. Different planning work, scenario counts and review outcomes prevent a general speed or reliability percentage. The reading build was shorter, but longer planning/design work, the stopped review, and its proof response offset that gain.

The 21-event count includes five low-severity discovery misses: absent guidance and absent `opsx` probes. They are retained for consistency with the expense log, but are not broken infrastructure. The remaining 16 events include artifact validation, provider symptoms, tool misuse and the stopped review. Two additional findings sit outside this execution-event count: bulk checklist reporting and stale cleanup metadata.

There are 18 READ log entries, not 18 proven root causes. READ-01 and READ-03 share one inventory cause. Provider errors remain symptom groups where their underlying cause is unknown. One rejected review command produced six propagated D1 error rows; those count as one incident. Two denied file reads in one shell command count once. Cleanup's two wrapper errors count as one incident. The two relay failures hidden by successful outer shell exits still count.

The build transcript has 99 completed commands, including 55 expected exit-75 pending responses and five unexpected exits. The response has 36 commands, two expected pending responses, four failed commands and two masked relay failures. Those are command observations, not 135 independent tests. Normal quality feedback, expected negative checks, pending receipts, local operator mistakes and the unrelated staging outage are excluded. [Exact count ledger](failure-analysis-metrics.json), [original failure log](failures.md).

## What failed and why

| Area | Evidence and cause | Impact and disposition |
| --- | --- | --- |
| Frozen-source review reader — READ-12 | Claude searched `candidate/src` as a directory. The reader accepted individual checked files only and rejected the request. | The only stopped stage. Fixed during the run by expanding directories solely over the frozen inventory, retaining path and hash checks. Tool help updated; 16 targeted tests and typecheck passed; exact failed command replayed successfully. The saved candidate and proof survived the deployment and retry. |
| Preview route choice — READ-08, 13–16 | Both build and response entered local-preview setup for a static app. The response already had a working hosted deployment. Failures included local readiness, relay readiness, two 530/1016 replies, protected diagnostic reads, and dependent navigation before registration succeeded. | Seven events across these entries, recovered by using the hosted target. The unnecessary local path is established; the provider/DNS cause is not. The `Request.cf` warning is preserved but is not proven to have caused the readiness timeout. Existing skill text already permits direct hosted use, so repeating that advice alone is weak prevention. |
| Hosted readiness and transport — READ-09–10 | One published asset initially returned 522; two browser navigations reset. | Three events. Reading back the same publish request and later navigating to the same target worked. No replacement deployment was required. Keep these separate from local relay trouble; a shared provider cause has not been established. |
| Checklist reporting — READ-11 | The author wrote the first 17 completed checkboxes in one operation after tests/build. No task-file states for counts 1–16 existed. | Confirmed user-visible defect. The watcher has a 750 ms debounce and the portal polls every 5 s; those are configured cadences, not measured delivery guarantees. Faster polling cannot recover missing events. The two notification timeouts are separate observations and do not explain this bulk write. |
| Progress notification — READ-06 | Two wake-up requests exceeded the 3-second timeout. | Later progress and heartbeats continued. Existing bounded retry handled the situation; the exact successful delivery path and underlying network cause are unknown. No evidence justifies restarting the author or merely extending every timeout. |
| Operation submission order — READ-07 | The author queried `env-versions-1` before another shell sequence had submitted it, then created `env-versions-2`. Both eventually ran. | One failed status request and a duplicated small environment check. Stable IDs work only when the author keeps the same identity and distinguishes submission from completion. No duplicate demo occurred. |
| Error visibility — READ-15 | A failed preview command was followed by successful curl/echo commands; the shell returned zero. | Two existing relay events were masked, not two extra failures. Trusted CLI failure propagation was correct at the inner call but was defeated by the surrounding shell. Counting only final exit codes would miss both errors. |
| Design structure — READ-02 | Required content existed without the required section headings. | Completion validation rejected it once; the cloud author added headings and passed. This was an artifact-format repair, not an application test failure. |
| Discovery — READ-01, 03–05 | Two missing-guide inventories, two absent-tool/instruction probes, and one no-match task-guidance search. | Five low-severity misses. One `&&` chain prevented the remaining inventory from running. Treat optional absence explicitly while retaining actual permission, IO and syntax errors. |
| Cleanup — READ-17–18 | Browser close was accepted before absence was confirmed. Later the browser and attempt were destroyed, but the local-data resource row stayed ready. | Browser absence was confirmed about 8m10s after the first cleanup error, without supervisor intervention. The stale row is a separate bookkeeping defect. There is no evidence of a surviving local-data runtime. |

The review failure consumed a 3m42s failed attempt, followed by an 11m21s interval until the new attempt started. That interval includes diagnosis, testing, deployment and retry; it is not pure provider latency. The successful replacement review took 4m40s. The subsequent proof response took 13m25s, including a fresh install/check and avoidable local-preview work. Its entire duration must not be labeled wasted time. The two normal prerequisite gates spent 9m31s awaiting authorized decisions; this is supervision latency, not an execution failure. [Timings and count definitions](failure-analysis-metrics.json).

## Evidence quality and proof selection

Claude inspected the original nine-image gallery and found three missing demonstrations: a full status cycle with before/after counts, a selected empty filter, and the saved author after an invalid edit. These were evidence-selection gaps, not a finding that the app was fake or that those behaviors were broken. The initial seven-scenario collection had completed; selecting nine images did not retain enough of its story.

The cloud response created a revised five-scenario collection with 16 captures and selected 13 images. This was intentional proof revision after review, not the accidental duplicate/result-retrieval reruns seen in SAC-243. The final source comparison found all 17 PR files match the reviewed candidate. All 13 image URLs loaded anonymously with matching hashes; final Brave inspection covered eight images, including all three requested corrections. No second Claude pass was performed: the configured flow is one substantive review, one author response, then human review.

Claude also noted missing in-page measurements in Showboat. The shipped skill says browser measurements remain in diagnostics, while the review expected them in the demonstration record. Align that evidence contract before classifying missing Showboat measurements as an app defect. Trusted preview records supported origin and viewport. The generated preview warning also used whole-tree freshness after task-checkbox edits; unchanged served assets are stronger evidence about the app than that warning alone.

The author's claim to have visually inspected all initial captures is not independently established by the captured transcript. The analysis relies on actual reviewer evidence access, final browser inspection, and image/hash checks. [Claude's full review](claude-review-result.json), [final comparison](final-source-comparison.json), [published image checks](published-image-checks.json).

## Which earlier fixes worked

- **Dependency completion:** one installation was awaited and checks started after success. The expense run's missing Vitest/incomplete dependency failures did not recur.
- **Observable long operations:** live demo status reported scenario, step and activity while collection continued. Polling did not sit behind the demo.
- **Saved results:** the original collection's image paths were retrieved through the same operation. There was no repeat collection just to recover stdout or locate screenshots.
- **Design handoff:** the previous design file was restored in the response. The earlier missing-patch symptom did not recur.
- **Public proof links:** all 13 commit-pinned PNG URLs worked without authentication. This verifies publication, but is not a claim that GitHub mobile was tested in this run.

These are live observations of the repaired paths. They do not exercise every edge case: no forced disconnect/restart was introduced, no assertion is made that redirect handling was stress-tested, and unknown-ID ordering still caused one duplicate small check. [Operation receipts](install-operation-proof.json), [live demo status](demo-live-status-proof.json), [saved result retrieval](demo-completed-proof.json).

## Prioritized follow-up

1. **Report actual task completions as they happen.** Provide a small author-facing task-progress operation or checkpoint that records task ID, state and timestamp durably, with an active-task label between completions. Keep completion a cloud-agent judgment. Do not fabricate incremental counts or add a gate that judges implementation quality. Validate the next canary from author event through durable state to portal display, measuring latency. Prompt text alone already failed here.
2. **Make the hosted path the obvious path for static apps.** Present the existing hosted deployment and allowed target at response startup; route the ordinary static preview action through that capability. Keep a deliberate local path for apps that need it. Preserve the source/build match and same-request readback. A successful next static canary should need no tunnel allocation. This is the largest repeated, avoidable cluster; it does not establish a fix for the underlying relay service.
3. **Keep failures visible across compound commands.** Return and inspect each operation receipt, and preserve the primary command's status when collecting follow-up diagnostics. Give agents a supported, sanitized diagnostics/status interface instead of access to protected files. Check that an inner failure plus successful echo remains visibly failed. Do not loosen runtime-folder permissions.
4. **Unify cleanup completion paths.** Normal cleanup calls `implementationDestroyed`, which updates local-data resources, after sandbox destruction. `CleanupAuditor.scheduled()` destroys the sandbox and marks only the attempt; it lacks that callback. This source difference plausibly explains READ-18, but the exact production call path has not been traced. Share the post-destruction resource reconciliation, make it idempotent, and test delayed browser absence followed by scheduled cleanup. Retain the initial errors. No manual D1 status edit was made.
5. **Improve proof selection before handoff.** Give the author a compact map from planned behaviors to selected images, retaining before/after states for each claimed transition. Reuse still-valid captures when the selection interface permits it; align measurement placement between planner, skill and reviewer. Leave selection and sufficiency to the agents and human review, without a new automated quality gate.
6. **Tidy lower-impact tool assumptions.** Expose submission acknowledgement separately from result polling; reuse the request ID after ambiguous submission. Make optional inventory misses explicit, and provide the exact required design outline. Add notification latency/recovery visibility before tuning the timeout. The frozen-reader directory repair is already deployed; retain its regression coverage.

The next comparison should track these paths separately: stopped stages, supervisor repair episodes, preview setup failures, duplicate work, progress delivery latency, and cleanup convergence. An aggregate error count alone hides both genuine improvements and newly exercised failure paths.

## Evidence and limits

All 71 collected artifact files were rechecked against their saved SHA256 values during this analysis. The durable snapshots, full original-error excerpts and per-stage transcript audits remain linked from [failures.md](failures.md). No new provider run, browser scenario, deployment or PR action was taken for this report. Provider root causes remain unknown where the evidence only shows a timeout or HTTP error. The temporary staging portal outage has no established causal connection to this canary.

Post-run analysis also had local-only inventory mistakes: guessed absent worker paths and an unmatched shell glob. They were corrected by searching the actual source tree. They caused no cloud requests or state changes and are excluded from the canary totals.
