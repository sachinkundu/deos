# Independent review error audit

The status reader could miss a failure file published between its first file check
and process exit. Cleanup then deleted the only copy. The regression test forces
that ordering and checks the original message and cause in D1 and R2.

| Boundary | Correction |
| --- | --- |
| Claude status polling | Read terminal files again after observing process exit. Repeated failed-status reads return the original error reference. |
| Claude invocation failure | Verify R2 evidence and write its D1 reference before setting failure state. Storage failures retain both causes. |
| Claude cleanup | Keep the runner alive until evidence is saved. Stop and drain the process, collect terminal files, then destroy it. Failed capture can be retried. Cleanup and state-write failures retain their causes. |
| Claude request publication | Preserve rename output, exit code and timeout flags. |
| Claude HTTP adapter | Preserve response body, status, operation and original error reference. Retry transient status reads up to three requests; never replay an ambiguous provider turn. |
| Trusted Claude process | Write the full failure to stderr as well as the terminal file. Preserve provider events and errors during drain and cleanup. |
| Claude result validation | Keep provider auth/quota events, invalid response text, terminal evidence and configuration failure causes. |
| Planning/design subprocesses | Wait for close so both pipes drain. Preserve stdout, stderr, exit code, signal, command and cause. |
| Planning/design temporary files | Keep the primary error if temporary-file cleanup or native request saving also fails. |
| BettaView review helper | Retain full output instead of only a tail. Preserve retry errors and wrapping causes; update the maintained copy and bundle hash together. |
| OpenRouter transport retries | Record every original failed request, including failures followed by a successful retry. |

Expected absence checks and validated proof-repair loops remain. They either
handle a named recoverable condition or already record the original exception.
The existing safe public categories remain; they now link to complete evidence.

## Evidence boundaries

The Showboat record reads the original SAC-172 failure directly from live D1/R2.
The built-image check runs a real process locally with networking disabled.
Regression tests exercise races, HTTP failures, retries, diagnostic storage and
cleanup faults. These checks do not prove that an updated production reviewer
has reached the provider. This PR does not deploy, retry SAC-172, or cross its
human review gate.

SAC-172's trusted runner exited at 10:17:33.855 UTC and its sandbox was destroyed
at 10:17:54.770 UTC on 2026-09-13, according to retained process/container logs.
The saved error has exit code 1 and empty output. The error-loss race is
reproduced, but the original provider message for that historical invocation
has not been recovered. An offline run of the old deployed image reached its
provider wait and timed out, so it did not establish SAC-172's provider cause.


## Live recovery on 2026-09-13 (SAC-181)

Worker `d5829f3d-8293-43a8-ab93-f297fbe1847a` was read back at 100% traffic.
Both Sandbox classes completed rollout to image
`sha256:c52ee12e7c297049a5da3b09bf436b6e4492ee31ea0ca11be87fdf433e9228bf`.
The individual application readbacks showed four healthy instances each.
The list endpoint briefly returned an older image after rollout, so the individual
application and completed rollout were checked before starting SAC-172.

SAC-163 had failed again at 11:20:32 UTC on the old runtime. The authorized
publication retry at 11:26:55 UTC reused its saved candidate and existing PR #128.
Publication reconciled at 11:27:05 UTC with category
`planning_review_feedback_deferred`. The workflow reached `awaiting_human` /
`planning_review`, and Linear returned to Human Review at 11:27:06 UTC.
The PR body explicitly states that some feedback is not covered by this revision;
it keeps the existing comments available and does not invent a reply or claim
that no new feedback exists. This uses the user-requested Human Review fallback,
not an unbounded author loop. A later revision reads current GitHub feedback,
so no dummy comment is required.

SAC-172's authorized same-definition retry started at 11:27:16 UTC. Its new
independent-review attempt `01a09a85-8c7d-755e-b893-199861bf75c9` completed with
`result_class=pass` at 11:32:07 UTC. Both real Claude response receipts were saved,
and cleanup is `destroyed`. The workflow then allocated a fresh
`planning_independent_response` attempt. The original failed attempt and all
prior errors remain intact. The historical provider exit cause remains unknown;
this live pass proves recovery, not a reconstructed cause for the old exit.

No new PR was opened for this follow-up. The existing PR carries the tested
changes and this evidence. No planning/design approval or merge gate was crossed.

## Design review metadata and interrupted transcript capture

The later SAC-172 design attempt completed a native recheck with all seven
findings rated fixed. Its source inventory referred to the local candidate
`openspec/changes/sac-172/design.md`, while `searchDisposition` was
`not_searched`. The validator incorrectly required this local citation to behave
like a searched web source. The saved result is in `sac172-recheck.json`.

Reviewer citation metadata is now interpreted separately from finding ratings.
Local document references and bracketed source IDs are recognized. Inconsistent
search labels are normalized. Ambiguous citations remain visible with their
original declaration and a warning; they do not invalidate completed ratings.
Finding identity, candidate digest, observed review execution and human approval
remain enforced. This is deterministic interpretation of review evidence, not
another model call that can fail or change the verdict.

The parent transcript had a separate lifecycle defect: its temporary capture was
published only on normal process completion. When native review failed, the
controller killed the supervisor before publication, then destroyed the sandbox.
The new capture location survives supervisor termination. Failure collection
publishes it after stopping the process, before artifact collection and cleanup.
A failed publication propagates and retains the sandbox for retry. Original
stderr is saved separately even when an existing validation file is present.

All 449 tests and the type check passed. `probe-capture.mjs` ran in the built
Linux container with a real SIGKILL and verified exact transcript and stderr
bytes, repeatable publication, and retained source files after publication
failure. `probe-semantic.mjs` replayed the actual failed recheck in that image;
all seven fixed ratings were retained and the local citation was recognized.
These are local process and replay proofs, not a claim of a provider-induced
production failure.

The old missing parent transcript cannot be recovered because its sandbox was
already destroyed. An explicit operator retry can now start a fresh author and
review attempt from this reconciliation state. It retains the frozen definition,
failed attempt and evidence, and does not reuse the unverified verdict. SQLite
integration tests prove one durable retry and rejection of stale visits,
unrelated failures and unfinished cleanup.

## Live interrupted capture proof and follow-up recovery

On the new image, SAC-172 attempt `01a09af6-7b5d-75b2-b004-3feb503e270d`
failed during recheck. This time the failure manifest retained the 247,075-byte
parent transcript (SHA-256
`b57f3fb19ff3b6dbb2b6947c8118f2a3b9e87f57e21744ebe2c5a49543eb5281`),
206 bytes of original stderr, and both native child transcripts. R2 content was
read back and matched the stored sizes and hashes after sandbox destruction.
The recovery record is eligible and resumes at recheck. This is real production
failure evidence for the capture fix.

The saved recheck response reports `REQUEST_FILE_UNAVAILABLE`: the reviewer
interpreted "do not spawn children" as forbidding the filesystem-reading process
needed to read its request file. The validator replaced that with `invalid
ratings`. Reviewer instructions now explicitly allow read-only shell processes
and prohibit delegation to additional agents. Reported reviewer errors retain
the original message and response as the cause. A failed native invocation gets
one automatic retry on the same checked candidate. After a second recheck failure,
review is marked unavailable and all findings stay open for the human gate.
Candidate writes and evidence-integrity failures are still reported as failures.

The same attempt recorded 83 "Execution timed out after 10000ms" entries.
Their saved stacks identify `ContextImpl.waitForEvent` and
`WorkflowTimeoutError`, but Cloudflare RPC set the error name to `Error`.
The handler recognized only the original name and recorded normal heartbeat
waits as workflow errors. The handler now recognizes this precise RPC shape,
records a normal wait-elapsed event, and propagates unexpected wait errors with
the original evidence. Existing historical error records remain untouched.

All 453 tests and type checks passed after these follow-up changes. The native
hook test runs both failed rechecks through the production state machine and
verifies retained errors, the two-invocation bound, unavailable status and open
findings. The built image replays the original blocked response and retains its
full error rather than reporting invalid ratings.
