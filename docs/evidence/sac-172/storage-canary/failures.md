# SAC-246 failure log

Prospective log, 17 September 2026. Run1 started13:37:26UTC from a genuine Linear
Todo event, on frozen implementation v41. The first planning agent is starting.
Preflight/extension failures are in
[the extension log](../../temporary-environments/failures.md).

## Automatically fixed

No automatically recovered cloud-agent failures observed in the available
planning transcript. Only the first four completed commands were captured;
the later interrupted filesystem was lost, so this is not a complete audit.

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

The complete cloud-agent path, incremental task updates, real browser persistence,
PR evidence publication and automatic resource teardown need this run's proof.
The prior adapter probe verifies provider mechanics, not these end-to-end claims.
No implementation Worker, D1 database or R2 bucket existed when planning failed.
