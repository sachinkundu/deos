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
