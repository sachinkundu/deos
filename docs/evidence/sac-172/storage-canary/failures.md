# SAC-246 failure log

Prospective log, 17 September 2026. Run1 started13:37:26UTC from a genuine Linear
Todo event, on frozen implementation v41. Planning has needed two recoveries.
Preflight/extension failures are in
[the extension log](../../temporary-environments/failures.md).

## Automatically fixed

### STORE-06 — Cloudflare Durable Object memory reset recovered

At15:51:24.796UTC during design_author, Cloudflare reported:
`Durable Object's isolate exceeded its memory limit and was reset.`
The preserved original error includes `overloaded:true`, `durableObjectReset:true`
and the SandboxAgentController.reconcile / executeAgent stack. See
design-memory-reset-error.json and the original D1 error
b0e2caee-dfd4-409c-919d-e15c28041b09. This is a real provider runtime failure,
not a design-review quality finding.

The workflow recovered without an operator retry or deployment. The same
design author completed15:52:41.644, its sandbox was cleaned, design PR44 was
published, and independent design review started15:53:01.936. All final design
and review artifacts were retrieved from R2 and hash-verified against D1.
The complete author transcript and original reset are retained separately.

The operation that exhausted memory is not yet identified. The stack localizes
the failed sandbox reconciliation call but does not establish a memory leak,
oversized request, or another source. The bounded issue telemetry window has
normal collection/publication/transition records, but no more precise cause.
Do not claim the underlying memory-pressure cause is fixed. No backend change
or deployment was made while the next review was active. User notified once.

### STORE-04 — File discovery stopped on a no-match search

The second planning attempt's first command returned exit1 after printing its
working directory. Its chained `rg --files -g AGENTS.md` found no file and
prevented the remaining discovery command from running. The cloud author
repeated discovery without that dependency and continued successfully. This is
one recovered command failure, not a product defect. The full saved transcript
contains ten completed commands, one with a nonzero exit.

Repeated in planning_independent_response attempt01a0afe3-f0a7-7d12-83f7-8a3906182381:
the first chained AGENTS.md search again exited1 on no match. The next command
recovered discovery. That response completed12 commands with one nonzero exit;
planning-response-audit.json retains the exact command and output. Two observed
occurrences of this cause so far.

### STORE-05 — Optional readability library was unavailable

The cloud author's dependency probe printed
`ModuleNotFoundError No module named 'textstat'`. The enclosing command returned0
because the probe caught and printed the exception. The author then wrote its
own readability checker and passed the requested thresholds. Record this
separately from command exit failures; exit0 does not mean no error occurred.
The checker and exact scores remain in the full transcript and validation file.

The independent-response author repeated this probe and printed
`textstat-python unavailable: No module named 'textstat'`, with an enclosing0
exit, then used its own Python readability check successfully. Two observed
occurrences so far. This recurring optional-tool miss is retained separately
from the two recovered discovery exits.

Audit limits: only the first four commands of the first, interrupted attempt
were captured before its filesystem disappeared. The second attempt's full
transcript and patch were recovered from R2 and verified against D1 hashes.
This is not a complete audit of the lost portion of attempt1.

Planning quality findings, separate from runtime failures: the successful third
author's native self-review produced13 traceability/scope concerns (including10
directional disagreements). Cloud authors resolved all13 and the recheck passed.
Trusted final OpenSpec, whitespace and readability checks passed15:00:08.735UTC
without a completion-repair round. See planning-self-review.json and
planning-author-completion.json. These findings are not13 failed workflow events.
Independent discovery later reported four secondary link-mapping disagreements.
The response recorded a reasoned no_change for each; the supervisor inspected
those reasons and the unchanged PR43 head before approving the planning gate.
They are review findings, not runtime failures or additional repair rounds.

### STORE-12 — Test harness incompatible with the selected emulator

Trusted test operations sac246-test-1 and sac246-test-2 failed at17:28:53.207
and17:31:37.523. The selected latest Miniflare API rejected the old constructor
options, first requiring workers and then workers[0].config. Browser tests also
failed to read a source file through a non-file import URL and attempted to load
styles.css from an absent localhost server. These are two failed check operations
with several harness diagnostics, not remote D1/R2 failures. The cloud author
revised the harness and emulator dependency; the third test reached application
behavior with12/16passing. Full original commands, stdout and stderr remain in
build-test-failures-1735.json. No supervisor application edits.

### STORE-13 — Body stream handling and lifecycle test failures

sac246-test-3 failed17:34:44.711 with four failing tests: a read returned500
instead of200; a cleanup-failure fixture expected the index removed too early;
and two lifecycle cases exceeded the default5000ms timeout. Original read error:
`Body has already been used. It can only be used once. Use tee() first if you need
to read it twice.` The cloud author removed the premature R2 body stream access,
placed the injected deletion failure after index removal, serialized test files,
and allowed30seconds for lifecycle tests. Poisoned-stub errors followed emulator
disposal after timed-out tests; preserve these as secondary diagnostics.

Recovery: sac246-typecheck-5 passed17:36:16.801 and sac246-test-4 passed all16
tests across four files at17:37:28.413. The preserved tests include incomplete
deletion recovery with an absent index and paused-owner/delete fencing, providing
local regression evidence for STORE-07/08. This is not yet real remote browser or
D1/R2 proof. Formatting also passed17:38:17.118. Full receipts are retained in
build-test-recovery-1740.json, including expected injected failures on stderr;
those deliberate fixtures are not additional provider incidents. The test gate
kept the build in progress throughout the three failed runs. Cloud agents made
all application/test fixes; supervisor only inspected and logged them. User
notified once about the failing gate and cloud recovery; no action required.

## Fixed by supervisor

### STORE-01 — Supervisor started the canary before the rollout finished

At13:40:00.709UTC, the exact Sandbox provider log says:
`Runtime signalled the container to exit due to a new version rollout: 0`.
Planning attempt01a0af96-705a-77f2-85ab-cd28486c6450 became interrupted at
13:40:17.910, with `process_not_recoverable`; the run failed13:40:20.019.
The13:35 deployment had started a fresh basic-pool rollout93to94 with the same
image digest. It did not finish until13:40:32.934. The supervisor had checked
the image and healthy count but missed the still-running rollout, then launched
the canary13:37. This was a supervisor-caused interruption, not an app failure.

The original missing-auth-file error occurred while failure cleanup tried to
delete an already-absent file; it was a consequence, not an authentication cause.
Its full stack and cause remain in planning-error-62636673-5f0b-4d2c-9bda-6bc365cfb3c5.json.
The provider stop error and full rollout steps are saved in
planning-interruption-provider-error.json and planning-interruption-rollouts.json.
The complete failure manifest confirms all attempt output files were absent.
The earlier private live snapshot remains available; no missing app/plan output
will be fabricated or reconstructed by the supervisor.

Correction: added a mandatory `ready` check to the rollout helper that requires
completed rollout status, matching target application version,100% target
instances and zero old-version instances, as well as expected image and health.
Provider readback now confirms every rollout completed. Recovery will retry only
the same planning stage/run and frozen v41 after the retained sandbox is cleaned.

### STORE-02 — Interrupted attempts could not release their cleanup hold

Source inspection during recovery found that the supported cleanup endpoint
allowed a failure hold to be released only for `failed`, while stage retry also
supports `interrupted` and `absolute_timeout`. This attempt is interrupted and
has a24-hour retention hold despite its already-empty filesystem.
Extended the existing endpoint to those two terminal states. It still requires
an explicit request, unchanged attempt identity/timestamp, a complete durable
failure manifest and a nonrunning process. Active work remains rejected, and
the original state/error remain intact. Focused SQLite and controller regressions
cover all three states, missing manifests and live processes. No manual D1 edits.
Backend-only repair9c39fb05 activated at100% with no container update. The27
focused tests and typecheck passed. Supported cleanup returned200/destroyed and
D1 confirmed it. Same-run, same-v41 planning retry was established13:52:33.526 at
visit4. All original error rows, provider logs and failure manifest remain.
No earlier completed phase or application work was repeated; the unfinished
planning phase must recreate its lost working files in the cloud.

## Still needs fixing or validation

### STORE-03 — Provider usage limit stopped planning

Planning attempt01a0afa3-fe81-70e0-8e55-bca7ee3fae73 exited1 at13:56:51.181UTC
and failed13:56:56.090 with `codex_exit_nonzero`. The original provider message,
present in both `error` and `turn.failed` events for the same incident, is:

> You've hit your usage limit. Visit https://chatgpt.com/codex/settings/usage to purchase more credits or try again at Sep 22nd, 2026 3:46 PM.

The full transcript, 8,642-byte planning patch and validation file are durable
in the complete failure-v2 manifest. Local downloads matched their D1 SHA256
receipts; see planning-usage-limit.json. OpenSpec, readability and diff checks
had passed, but author completion and self-review had not run. No gate or
application PR opened, and no application infrastructure had been allocated.

The supervisor found the failure at14:39UTC. At14:40 the signed-in desktop
account's read-only usage check reported0% used; cloud credential identity was
not independently compared, so this alone does not prove cloud quota recovery.
No credit was purchased and no reset was consumed. After verifying preserved
work, no active attempts and completed rollouts in every pool, the supervisor
cleaned the stopped sandbox through the supported endpoint and requested one
same-run, same-v41 planning retry. Its cloud execution will verify availability.
If the same limit recurs, stop retries until a quota/account change is confirmed.

Recovery outcome: the third author finished its entire planning stage with
trusted checks passed at15:00:08.735UTC. Planning PR43 was published and the run
advanced to independent discovery. The cloud quota was usable for that stage;
the reason it became available is not established. No quota reset was consumed
by the supervisor. Retain the provider-limit incident in the run's totals.

The failed planning patch is retained as evidence; current planning continuation
selects completed attempts only. This retry recreates the unfinished planning
stage in the cloud rather than restoring that failed patch. Reusing failed
planning output safely remains a workflow improvement, not a completed fix.

The complete cloud-agent path, incremental task updates, real browser persistence,
PR evidence publication and automatic resource teardown need this run's proof.
The prior adapter probe verifies provider mechanics, not these end-to-end claims.
No implementation Worker, D1 database or R2 bucket existed when planning failed.

### STORE-07 — Failed deletion has no browser recovery path

Supervisor review of PR44 head beca148afbbd4fbdfbaa99dbbe2acad23bf37ae5
found that the API retains deleting state and expects a retry, while the UI
disables further delete actions for deletePending rows. Refresh can therefore
leave a user stuck. If cleanup removed the saved index row before its final
absence check failed, the join-based list also loses the ID needed for retry.
This is a design defect found before implementation, not an observed storage
outage. Six earlier independent concerns were applied by the cloud agent,
but this recovery gap remained in the resulting design.

At16:07:32UTC the supervisor posted concrete feedback in Linear comment
c548bb3e-afcb-406a-b663-f796ed67eab2 and requested a design revision by moving
Human Review to In Progress at16:07:33.034. The requested fix distinguishes
in-flight from persisted incomplete deletion, retains an actionable ID across
refresh, uses the existing idempotent DELETE, and adds a failure/retry test.
Cloud agents own the revision; no sample-app implementation or design was
locally edited. Status: awaiting revised design and verification.

Supervisor tooling note: one read-only source search failed before execution
with `zsh:1: no matches found: workflows/implementation*`. A repository-wide
search found the actual config/workflow.implementation.yaml transition mapping.
No workflow state or artifacts were affected by that search mistake.

STORE-07 design recovery at16:14UTC: the cloud revision supplies persistent
recovery metadata, an enabled Retry delete after refresh, and a deterministic
failure/retry test requirement. Supervisor reviewed the full current design.
The design fix is verified at head bfcf9e084136134b2dfab551ee378c2c925670ef;
its implementation and test behavior remain to be verified by the canary.
Independent review is running; no gate was bypassed.

STORE-04 recurrence during round-two design response: first chained discovery
command exited1 because `rg --files -g AGENTS.md` matched no file. The cloud
agent continued with a separate file read and design edits. Third observed
occurrence of this known discovery issue; no new runtime failure or user
action. Full available live transcript audit is saved in
design-round-two-response-live-audit.json; final durable audit remains pending.

### STORE-08 — Retry redesign reintroduces late R2 writes after deletion

Supervisor review of head f8cd86e9f9eb36388cd0152642a2f364c169defe found a
concurrency regression in the round-two response. The response allows multiple
requests with one browser token to put identical bytes. A and B can both pass
the creating-state check; A puts and activates; DELETE removes the object and
returns204; delayed B then puts the object back. A later rejected D1 activation
does not undo the R2 write. It also falls outside the released reservation.
A definite-failure reservation release has the analogous late-writer risk.
This is a concrete design interleaving, not an observed provider data incident.

Requested a cloud revision16:29:49UTC through Linear comment
23ebd129-cbab-4fb7-8e1d-7542c6f4c984: restore the simpler single-writer rule,
resolve stranded-save UX through explicit new-ID choice and honest messaging,
and require a deterministic paused-writer/concurrent-delete check. Exact
reconciliation of an already-present object remains allowed. Also clarified
that the actual runner supports adjacent fresh-context scenarios against the
same cloud data, so direct browser persistence proof need not be reseeded.
Status: cloud revision requested; no local application or design edit.

Final round-two response audit:106,372bytes,7completed commands,1nonzero
exit (the already-recorded third STORE-04 no-match lookup), zero provider
error events. Trusted completion passed. All six independent dispositions
were applied; structural validation did not detect the new semantic race.

STORE-08 recovery at16:36UTC: cloud revision head
ac60ae1a5d4756e4e94e6834d080048bab1a0cc3 restores single-writer ownership and
adds the exact paused-writer test schedule. Design correction verified by the
supervisor; real implementation behavior remains pending. STORE-04 also
recurred once in this author (fourth observed occurrence), recovered by the
cloud agent. Its original command/output is retained in
design-third-revision-audit.json. No new workflow deployment was made.

### STORE-09 — Recovered shell quoting error in cloud design checks

Round-three response01a0b03d-6f2b-783c-90e7-ef267cf33f07 issued a search
with an unmatched literal backtick inside its shell expression. Bash returned
exit2: `unexpected EOF while looking for matching` followed by a backtick,
then `syntax error: unexpected end of file`. The cloud author corrected the
search and completed validation. Full exact command/output is saved in
design-round-three-response-audit.json. Final audit:170,104bytes,21completed
commands,1nonzero exit,zero provider error events. Trusted completion passed.
This was automatically fixed by the cloud author, not an application defect.

Supervisor read-only tooling also hit a shell glob error on an unquoted GitHub
query-string path (`zsh:1: no matches found`). Reissued through a literal argv
list and read the exact approved file. No workflow state or app was changed
by that failed lookup.

### STORE-10 — Unavailable package version stopped the first dependency install

Build operation sac246-install-1 started17:12:21.827 and failed17:13:06.424.
Original npm error: `ETARGET`, `No matching version found for
@cloudflare/workers-types@^4.20260917.0.` The cloud author selected an
unavailable version. This is one failed operation, surfaced both by --wait
and a later status read; do not double-count it. Three observed CLI exit75
status responses mean running and are not failed operations.

The cloud author changed workers-types and miniflare selectors to latest and
started sac246-install-2 at17:19:51.710; still running in the17:20:56 snapshot.
Recovery is owned by the cloud agent. No local application edit or runtime
deployment was made. Exact command and nested stderr retained in
build-live-audit-1720.json; final durable manifest audit pending. User notified
once that the dependency install is being corrected; no action required.

STORE-10 recovery confirmed: sac246-install-2 completed17:21:30.114, exit0,
84packages installed and empty stderr. Saved full operation receipt in
dependency-install-recovery.json. The cloud agent fixed its own dependency
selection; no supervisor code change was needed. Build remains in progress.

### STORE-11 — Typecheck caught initial application/test typing errors

Trusted operation sac246-typecheck-1 failed17:27:11.710 with exit2. Original
output includes TS2345 Uint8Array/BufferSource incompatibility in the hashing
helper, missing DOM globals/types in browser tests, a missing JavaScript module
declaration, and possibly-undefined R2 customMetadata. These are one failed
typecheck operation with multiple diagnostics, not separate workflow failures.
Exact full diagnostics and recovery receipts are in build-operations-1728.json.

The cloud author revised its TypeScript settings, hash input and test typing,
ran formatting, then sac246-typecheck-2 passed17:28:12.618 with exit0 and empty
stderr. Automatically fixed by the author; no supervisor implementation edits.
The next test operation was running at17:28:30. Final build manifest and
independent gates still need to validate the complete candidate.

### STORE-14 — Runner lacked public routing for temporary Worker control

Three publish operations (sac246-remote-1/2/3) failed17:46:17,17:46:43 and
17:47:38 with `Temporary Worker health: HTTP 404 error code: 1042`.
A subsequent migration failed `Remote environment is not ready`; this is a
consequence of the blocked publication. D1 confirms one owned allocation,
Worker deos-tmp-366011a3f9d248f2edfd399c, D1 and R2, but no ready receipt.
Retries reconciled that same allocation. Original errors/stacks are preserved
in environment-publish-failures.json and the completed manifest.

Supervisor confirmed the deployed broker only had nodejs_compat. Cloudflare's
primary errors documentation identifies1042 as same-zone Worker fetch without
global_fetch_strictly_public. A separate authenticated external health read
returned200 with the exact saved bundle digest and both bindings. This isolates
the failure to the broker's routing configuration, not missing API permissions
or unhealthy application code. See environment-1042-diagnosis.json and
https://developers.cloudflare.com/workers/observability/errors/.

Cloud author correctly stopped with needs_human,26/32tasks, at17:48:37 rather
than substituting static/emulated proof. Full1,191,408-byte transcript and
195,415-byte app patch were hash-verified from R2. Sandbox destroyed; D1 reached
implementation_clarification_wait visit41. This exercises the implementation
clarification gate and preserved-work recovery path. The question incorrectly
said no remote origin existed; the allocation existed but was not ready.

Supervisor added only the broker compatibility flag and documented the lesson.
Wrangler dry-run and TypeScript checks passed. Fresh D1 had zero active attempts
before deployment; backend7ecbe986-d40a-47e5-ad9c-05fb4b527490 deployed with
containers-rollout none. No app code was edited. Activation and resumed cloud
publication must verify the repair. The original allocation remains tracked
and must be deleted with all run-owned resources after durable PR proof.

### STORE-15 — Missing formatting request file, automatically recovered

Full final transcript audit found item54 failed ENOENT opening
/deos/output/requests/format-write-3.json. Cloud author corrected its request
preparation and final formatting passed. One command failure, no provider
incident and no supervisor app edit. Original full stack in
build-clarification-audit.json. This was missed by the earlier tail-only read.

### STORE-16 — Local isolated preview relay unavailable

Before remote publication, four preview calls failed: initial public readiness
failure followed by three `Isolated preview relay reconciliation HTTP 530:
error code: 1016` responses. Local workerd root check later passed, but public
relay/DNS cause remains unproven. This repeats the prior canary's local relay
symptom; it is separate from1042 and not claimed fixed by the new flag.
The approved canary uses publish_environment with real D1/R2, so local relay
success must not become an unnecessary prerequisite. Retain this as unfixed
workflow behavior. Original errors/stacks in build-clarification-audit.json.

Final build audit:86completed shell commands,34nonzero exits, including16
exit75 in-progress reads and repeated observations of failed operations.
Do not treat those34 as34independent failures. Nine distinct failed trusted
operations: install1,typecheck1,test1/2/3,remote1/2/3,migrate1; additionally one
missing request file and four local preview calls. Zero native provider error
events does not erase these recorded tool/provider failures. Supervisor-only
read searches also named two nonexistent paths (test and src/implementation.ts),
returned exit2 and were corrected; no remote effect or cloud incident count.

STORE-14 activation verified17:50UTC: public flag read back and backend7ecbe986
at100percent, expected container digest and completed rollouts. Linear answer
sent17:51:12; remote proof remains pending because the authoritative gate has
not yet consumed its delivered wake. Built-in wake reconciliation is due18:00;
record its result separately and do not claim the app resumed yet.

STORE-14 recovery verified: original clarification reply consumed17:54:33,
saved implementation resumed at26/32, genuine broker publication passed17:58:52,
and migration plus real D1/R2/API readbacks passed. Exact receipts in
resumed-publication-proof.json; gate evidence in clarification-resumed.json.
This verifies the runner configuration repair, not yet browser/PR/cleanup gates.
The earlier191second gate wake delay resolved without duplicate/operator replay
before the next scheduled reconciliation; underlying cause remains unknown.

Fresh-sandbox observation: a find command returned1 because generated build/dist
were absent. Source/tasks were restored; cloud author installed and rebuilt, then
published the identical bundle. Treat as expected missing generated outputs,
not lost implementation or a new infrastructure incident.

### STORE-17 — Visual review caught CSS overriding hidden reader content

The cloud author inspected the first completed remote-browser collection
8bb84eb7-03af-4267-9a28-54dc3b209a3d (five scenarios, completed18:04:14) and
reported that the hidden loading placeholder remained visible over loaded
text because the stylesheet overrode hidden. Browser steps and API behavior
had passed; this is a visual application defect found by image inspection,
not a failed browser-tool operation. Agent report and original collection
receipts are in browser-first-capture-audit.json.

Cloud author alone added a [hidden] display rule. Formatting/build passed,
same owned environment republished18:06:21 with bundle72f8e3c7… and Worker
version0a8aa297-8d8b-4dce-bec8-8c0572e9dd70. It cleared synthetic fixtures,
verified empty API/R2, and deliberately recaptured the full ordered sequence
under a new operation ID. Collection66dd9f02-140c-48b8-89a6-9cd23908d260
completed18:08:28.483. This is required fresh evidence after an app change,
not an accidental duplicate submission. Captures and receipts are preserved
in browser-css-recapture-proof.json. Final image review/independent gates
still need to confirm the corrected presentation; no supervisor app edit.
User notified once; no action required.

Agent commentary says the runtime skill blocks native patching and it used
the allowed shell instead. There is no failed native-patch tool event in the
captured transcript, so this is not counted as another executed tool failure.

STORE-17 final author audit: cloud author says all corrected images were
inspected and selected six from the final nine. Formatting/build and complete
remote browser sequence passed after the CSS edit; the earlier16-test suite
was not repeated for CSS only. Full transcript audit has no new failed trusted
operation. Independent demonstration gate is now running; its verdict is still
pending. Author task completion is not final implementation approval.
