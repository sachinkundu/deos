# Local browser workflow change and SAC-246 repeat

## Preparation failures fixed by the supervisor

- Read-only preflight query referenced a nonexistent `agent_attempts.stage` column.
  SQLite rejected it (7500); corrected to the actual schema. The successful query
  confirmed no pending, starting, running or collecting attempts. No D1 writes.
- Initial broker regression imported Cloudflare runtime APIs directly in Node
  (`ERR_UNSUPPORTED_ESM_URL_SCHEME: cloudflare:`). Used the existing test pattern
  to replace only the sandbox provider boundary; the real broker/store are tested.
- New proof assertion used `artifact.key` instead of the returned `path` field.
  Corrected the assertion; the saved proof bytes match. These are test-authoring
  errors, not cloud agent failures or automatic recoveries.

## Validation so far

Final backend suite: 622 tests, 621 passed, one existing test skipped, zero failed.
Typecheck and the real Linux Chromium regression passed.
No sample application code, proposal, or design has been changed by the supervisor.

## Runtime flaw found and fixed by the supervisor

- The real Linux browser regression showed that Playwright route.continue followed
  a redirect to another localhost port without calling its filter again. The first
  symptom was ERR_CONNECTION_REFUSED instead of ERR_BLOCKED_BY_CLIENT. Replaced
  that filter with Chromium CDP Fetch interception, which checks each redirect hop.
  The regression now starts a server on the forbidden port and requires zero hits.
- The next regression reached the correct blocked redirect but immediately navigated
  again while Chromium was still displaying its error page. Corrected the test to
  reset its context before the next scenario, matching the existing demo contract.
  Original error: Navigation to /bad is interrupted by chrome-error://chromewebdata/.

These occurred in isolated local validation, before any workflow deployment or
canary restart. No automatic agent recovery is claimed.

- A local validation command was launched against the previous image tag before
  the new build finished. It failed because the new browser wrapper was absent.
  Waited for build completion before rerunning. This was supervisor sequencing,
  not a cloud runtime failure.

## Review gate compatibility fixed by the supervisor

The existing human-revision path intentionally reused its older demo review. That
would fail to exercise the independent gate for this browser replacement. Added
a browser-runtime identity to trusted candidates and reviewer context; handoff
now rejects a review of a different runtime, entering the already frozen demo gate.
Same-runtime single-response behavior remains unchanged. Regression passed.

Final backend suite: 622 tests, 621 passed, one pre-existing skip, zero failed.
Typecheck passed. The final deployed image passed the real Chromium regression
with the separate OS user before upload.

## Release validation

The final image passed the real-browser regression, including separate browser UID,
multi-hop redirects and blocked image/frame requests to the supervisor port. All
GitHub CI checks passed. The upload took roughly ten minutes; no failed upload
was observed. The canary is held while the normal gradual rollout completes.

## Cloud rollout failure fixed by the supervisor

The basic pool rejected the first image before the canary started. Cloudflare
reported ImagePullError / ImagePullRequestedDiskSizeToSmall at 07:27:40 UTC:
"the runtime failed unpacking the image because the requested disk size was smaller
than the unpacked size of the image. Try setting a larger disk size." Requested disk
was 4,000,000,000 bytes. The original provider event is in rollout-disk-error.json.
Larger pools activated successfully, but that was insufficient to start the canary.

The first image unnecessarily included headed Chromium as well as the headless
shell, npm download caches and apt caches. The supervisor changed image packaging
to Playwright --only-shell and removes installation caches in their producing
layers. The browser executable and runtime behavior are unchanged. Rebuild, browser
regression and full cloud activation must pass before retrying SAC-246. This is
manual workflow recovery, not an automatic cloud-agent recovery.

The smaller image passed the same real Chromium regression at 1 GiB memory.
Its measured root filesystem fell from 3,300,077,568 to 2,166,628,352 bytes; this
measurement excludes provider unpacking overhead. Cloud activation remains the
authoritative check against the provider disk allowance.

## Frozen workflow engine preflight

Live provider readback found engine version f45cec59-181e-4c4a-80f5-2256444f2294,
created on 17 September, still waiting at implementation review visit 50. Updating
the Worker and containers alone would not apply the new browser-runtime handoff
check inside that engine. All 1,197 provider step records were archived privately
and hashed in engine-before.json. The engine can be restarted from durable D1's
saved gate; WorkflowOrchestrator.run reads the current run before choosing work.
This planned supervisor activation step must preserve definition41, approved
design/base, plan and candidate. It is not an automatic recovery or app failure.

Engine activation succeeded: version3990ce46-ab11-46f7-9fab-4b1fde94f1e1,
created18September07:18:59, resumed only the saved implementation gate50.
D1still shows definition41 and no active attempts. Proposal/design did not rerun.

At07:42:35 the implementation basic pool also reported ImagePullError for the
superseded2cc009 image. The provider event names that old digest; it is a second
observed occurrence of the same packaging cause, not a failure of the lean
ca9167 replacement. Snapshot: rollout-lean-progress.json. The generic basic pool
advanced past the first lean-image step; final activation is still pending.

At07:47:41 the implementation basic pool also passed its first lean-image step.
Provider health recorded1healthy target instance and no target errors. That step
took about7minutes18seconds; its slow startup cause is not established. This is
a deployment wait, not a new application failure or a supervisor retry.

## Canary started after verified recovery

All four pools reached the lean digest, completed rollout,100%target version,
four healthy instances each and no health errors/starting instances. The real
Linear event was consumed and implementation_build visit51 started, with frozen
definition41 and approved inputs unchanged. The five-minute supervisor heartbeat
is active. No new implementation-attempt failure has been observed at this point;
the full transcript and final cleanup audit remain pending.

## Implementation repeat: first observed failures

All entries below belong to attempt01a0b380-2dbf-70a5-8ecb-6fca8d3a5fe5, visit51.
The source snapshot and original messages/stacks are in repeat-errors-0800.json;
full private captures remain in /tmp/sac246-local-browser-reader.

| ID | Error and evidence | Cause and recovery ownership | Current outcome |
| --- | --- | --- | --- |
| LOCAL-01 |07:52:24.196, implementation progress signal: `DOMException [TimeoutError]: The operation was aborted due to timeout`, at implementation-progress-watcher.mjs:31 | The notification exceeded its timeout; underlying network cause unknown. Existing progress retry/collection owns recovery. This repeats READ-06 and prior storage progress timeouts. | The author remained running and commands progressed; successful delivery path is not yet established. No supervisor restart. |
| LOCAL-02 | The task helper rejected `Task 6.1 is completed; reopen it with state pending before marking active` | Cloud author sent active for a previously completed task. The guard worked. The containing shell went on to dependency installation and exited0; trusted diagnostics retained the error. This repeats the prior run's task-transition misuse. | Not a fatal attempt error; author continues. Do not claim a completed repair until a valid task transition is observed. |
| LOCAL-03 | check-current-1 finished08:00:08,15/16tests passed; tests/api.test.ts:135 expected201 but received500. Original activation cause: `AssertionError ... (message?.id === id)` | Local test-adapter message assertion; exact root cause remains unproven. Cloud author owns investigation. Deliberately injected list/put failures in passing tests are excluded. The wait and receipt poll show the same failed operation, counted once. | Isolated rerun test-api-read-rerun-1 passed08:01:27 without weakening the assertion. Full suite rerun is active. This is recovery progress, not proof the underlying intermittent cause is fixed. No supervisor app edit. |

These errors have been reported to the user once. Do not repeat unchanged notices.

##08:09UTC recovery and storage errors

LOCAL-03: the unchanged full suite test-current-rerun-2 passed all16tests at
08:04:09.392, then build-current-1 passed08:04:54.186. Cloud author recovered by
rerunning; no supervisor application change. The adapter assertion's root cause
remains unknown, so this is a recovered intermittent failure, not a proven fix.

| ID | Error and evidence | Cause and recovery ownership | Current outcome |
| --- | --- | --- | --- |
| LOCAL-04 | publish-remote-current-1 at08:07:23.828: `Temporary Worker health: HTTP404 error code:1042` (broker400 environment_control) | Same visible1042family as prior storage canary, but the public-routing flag is now deployed. The exact cause of this occurrence is unknown; transient readiness is a hypothesis. Cloud author issued publish-remote-current-2 after the failed receipt. | Same owned environment deos-tmp-707e60c64357d9e1197de094 became ready08:08:09.605; migration, D1query and appAPI200 succeeded. Automatic agent recovery, no supervisor deployment or duplicate environment. |
| LOCAL-05 | baseline-current-r2 at08:08:45.902: `Invalid object-list cursor` (broker400 environment_invalid) | Author sent objects with unsupported prefix:snippets/. The broker permits only operation and optional cursor, so its generic cursor error obscures the unsupported-field cause. | Agent recovery pending at this snapshot; no app edit is needed. Improving the validation message remains a workflow follow-up, not grounds to interrupt active work. |

Original operation errors, stacks and successful receipts are saved in
recovery-and-storage-errors-0808.json. The containing shell continued to a
successful APIread after the R2error; trusted receipts retain the failure.
LOCAL-04 and05 were reported once. Do not repeat unchanged notifications.

Browser startup evidence now records Chromium153.0.8010.12 over local-pipe at
08:06:24.184. The cloud author navigated to the actual loopback app and received
its rendered page. This proves local browser navigation, not yet completed image
proof, remote browser TLS, independent review or cleanup.

LOCAL-05 recovered automatically: the author removed prefix and submitted
baseline-current-r2-v2. The saved receipt confirms successful empty object listing
with no app/workflow edit. See r2-list-recovery.json. The misleading validation
message remains a nonblocking workflow follow-up.

## LOCAL-06: oversized demo request

The expanded demo-current-final-2 request was1,057,596bytes and exceeded the
trusted dispatcher maximum1,048,576bytes. It failed before browser execution:
`Tool request exceeds1048576bytes`, stack implementation-runtime.mjs:574.
Original native command/error evidence: oversized-demo-request.json. Count once;
this is not a browser crash or an app failure. It repeats the prior storage
canary's oversized-request class.

The cloud author preserved the failure, replaced large repeated bodies with98
one-byte browser saves to exercise the approved100object reservation ceiling,
and submitted new request demo-current-final-3. That complete scenario list is
running under collection97e4d234-cd51-44c1-9082-84e74386559b. At08:24:23 it had
completed the earlier six scenarios and was at capacity step235. This is an
automatic correction with recovery still in progress, not yet a completed demo.
No supervisor application change, cancellation, replayed single action or deploy.
The new error was reported once; do not repeat unchanged notifications.

## LOCAL-07: unsupported status CLI flag

During the final status audit, the cloud author used `deos-implementation --request
/deos/output/requests/status-final.json`. The CLI expects a positional file and
reported `ENOENT: no such file or directory, open '--request'`, with its original
stack at /usr/local/bin/deos-implementation:52. The author immediately used the
correct positional form and received exit0. No supervisor repair or code change.
Original error and successful status response: status-cli-recovery.json.
This is a tool invocation mistake, not an application/browser failure. Reported
once. A clearer unknown-flag error is a possible workflow follow-up.

LOCAL-06 recovery is now complete: replacement collection97e4d234-cd51-44c1-9082-
84e74386559b finished08:27:33.082 with7scenarios and11captures, including100object
capacity refusal created through real browser saves. Raw final readback lists
100R2objects, truncated:false, and the matching D1state. No synthetic reservations
were used for this repeated capacity scenario. Final-cloud-demo-receipt.json and
final-cloud-storage-proof.json retain the receipts. Review/publication still pending.

## LOCAL-08: native patch tool blocked

Completed author artifacts expose a second final-status preparation error at
08:31:36.178552UTC: the agent tried native apply_patch to write status-final.json.
The PreToolUse hook blocked it and directed the author to shell file writes.
The author then used tee, followed by the separately logged LOCAL-07 CLI mistake,
and corrected that too. Hook enforcement worked; no prohibited write occurred.
Original native stderr is preserved in native-hook-error.txt. This repeats the
prior storage canary's unsupported native tool use, not a new app failure.
No supervisor intervention. Both errors belong to final status preparation, but
are distinct failed actions/causes. This additional error was reported once.

Durable artifact audit verified SHA256 for all5completed author artifacts.
Chromium closed08:32:30.875 after all captures. The completion manifest has
transcript, result, patch, validation and implementation-diagnostics, but no
original-errors.jsonl. The progress watcher timeout survives in the supervisor's
live capture and repeat-errors-0800.json, not a dedicated runtime artifact.
This reinforces the existing diagnostic-retention follow-up; do not claim all
original errors would survive unsupervised collection.
