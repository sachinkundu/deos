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
