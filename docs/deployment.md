# Cloudflare deployment and rollback

DEOS has three deployable Workers sharing D1 and Queue resources:

- `deos-sample-project` is the small Python Linear webhook ingress.
- `deos-queue-consumer-ts` owns dispatch, Cloudflare Workflow, Sandbox, provider capabilities, artifacts, and cleanup reconciliation.
- `deos-workflow-portal` serves the Access-protected operator and Settings pages. Its internal `ROUTE_ADMIN` service binding calls the queue Worker's named `RouteAdmin` entrypoint without a public admin URL.

The orchestration rollout is additive. Keep `TRIAL_DISPATCH_ENABLED` false while creating bindings, applying migrations, uploading secrets, and deploying the pinned Container image. Enabling a project policy in D1 is the separate canary action.

Migration `0007_explicit_business_lifecycle.sql` is a guarded copy-and-swap of `orchestration_runs`, because SQLite cannot widen its status `CHECK` constraint in place. Before applying it remotely, export a D1 backup and record row counts, `PRAGMA foreign_key_check`, active-run uniqueness, and the current policy/definition digest. The migration preserves legacy version 3 `blocked` rows, includes both resumable statuses in the one-active-run index, and adds wait history plus completion-reconciliation records.

Migration `0020_multi_repository_routes.sql` is additive. It expands each project policy into a complete repository route, adds safe GitHub installation and access-check records, stores event route proofs, and adds frozen route columns to runs. Apply it before deploying route-aware Workers. The queue Worker's scheduled setup then fills the current seed route and every active-run snapshot and reads them back. Stop the rollout if any active run still has a null repository, App installation, revision, or digest.

The queue Worker seed carries both `LINEAR_PROJECT_ID` and `LINEAR_PROJECT_NAME`. The name is display and frozen-run context for the one legacy route; later routes receive their names from the live Linear catalog.

## Required resources

The checked Wrangler configurations name the existing D1 database, Queue, and private R2 bucket. The TypeScript configuration additionally creates:

- Workflow `deos-sandbox-codex-workflow` with entrypoint `DeosWorkflow`;
- Durable Object class `Sandbox` and its pinned Container image;
- a Queue consumer and fifteen-minute D1-known cleanup cron; and
- a named `RouteAdmin` Worker entrypoint for the portal's internal binding.

The Sandbox package and image must remain on exact release `0.13.0-next.738.2`; the Docker base is also pinned by digest. The image also pins Codex `0.147.0` and OpenSpec `1.8.0`, and the Docker build verifies both CLIs. Run `npm run types:check` after every binding change.

## Secrets and non-secret configuration

Load secrets from the ignored local `.env` without printing them. The orchestration Worker requires:

```text
LINEAR_APP_ACCESS_TOKEN
GITHUB_APP_ID
GITHUB_APP_PRIVATE_KEY or GITHUB_APP_PRIVATE_KEY_PATH
GITHUB_INSTALLATION_ID
CODEX_AUTH_ENCRYPTION_KEY
CAPABILITY_SIGNING_SECRET
CLEANUP_AUDIT_SECRET
STAGE_RETRY_SECRET
OPENROUTER_API_KEY
```

The same `STAGE_RETRY_SECRET` is installed on the portal Worker so its private
service binding can request an authenticated same-run retry. The orchestration
deploy script uploads that shared value to both Workers.

Set `LINEAR_APP_ACTOR_ID` to the actor ID observed for the Linear OAuth app, and `LINEAR_TEAM_ID` to the cleanup issue team. The checked configuration carries the verified non-secret IDs for this controlled workspace. The deploy script refuses to continue if a future configuration restores a `configure-before-*` sentinel. Prefer `GITHUB_APP_PRIVATE_KEY_PATH` so the PEM remains in its protected file rather than a shell environment variable.

`GITHUB_INSTALLATION_ID`, `LINEAR_PROJECT_ID`, and `TRIAL_REPOSITORY` are first-route seed and rollback inputs. They are not the live route allowlist after D1 has a route. `ROUTE_ADMIN_ALLOWED_EMAIL` is non-secret queue Worker configuration and must equal the portal's allowed Access email.

`SANDBOX_FAILURE_RETENTION_MINUTES` is a temporary canary debug control. Keep it
at `0` for normal operation. A positive value up to 1,440 retains only failed
attempts until the D1 deadline; successful attempts still clean up at once.
The controller removes Codex auth before recording the hold. The cleanup cron
destroys the Sandbox after expiry. A hold preserves the Sandbox id but cannot
guarantee that Cloudflare will keep the same idle container or local files.

Provider credentials exist only in the trusted Worker. The Sandbox receives a short-lived, attempt-scoped capability token, never a Linear token, GitHub token, GitHub App key, Cloudflare token, or encryption key. Git checkout uses that capability against the Worker's read-only `git-upload-pack` proxy. The Worker validates the frozen route and adds a short-lived App token only to its upstream GitHub request.

## Credential bootstrap

Authenticate Codex locally with the same controlled ChatGPT profile. Encrypt its `auth.json` without copying plaintext into the repository:

```sh
task_tmp="$(mktemp -d)"
CODEX_AUTH_ENCRYPTION_KEY="$CODEX_AUTH_ENCRYPTION_KEY" \
  node scripts/encrypt-codex-auth.mjs /path/to/auth.json \
  > "$task_tmp/auth.v1.enc"
npx wrangler r2 object put \
  deos-sample-project-artifacts/credentials/controlled-trial/auth.v1.enc \
  --file "$task_tmp/auth.v1.enc" \
  --content-type application/json
```

Remove the temporary directory after verifying the object exists. Each attempt
gets its own D1 checkout row and decrypts into `/root/.codex/auth.json`.
Concurrent attempts may read the same protected snapshot. A refreshed file uses
conditional R2 replacement. If another attempt already saved a newer valid
encrypted file, the losing writer keeps it. Any other conditional conflict
fails closed. The attempt deletes its local auth before artifact collection and
releases its checkout row.

## Deploy disabled

With a Docker-compatible daemon available:

```sh
set -a
. ./.env
set +a
./scripts/deploy-orchestration.sh
```

Then deploy ingress with `LINEAR_WEBHOOK_SECRET` using `./scripts/deploy-cloudflare.sh`. Build and deploy the portal only after the queue Worker exposes `RouteAdmin`. Inspect bindings and resources before enabling dispatch:

```sh
npx wrangler d1 migrations list DB --remote --config wrangler.queue-consumer-ts.jsonc
npx wrangler workflows list --config wrangler.queue-consumer-ts.jsonc
npx wrangler r2 object get deos-sample-project-artifacts/credentials/controlled-trial/auth.v1.enc --remote
```

Do not print the downloaded credential object. A presence/head-style inspection is sufficient.

For the route migration, also read back all current and active snapshots:

```sql
SELECT project_id, linear_project_name, trial_repository, github_installation_id,
       dispatch_enabled, route_revision, route_digest, github_access_state
FROM project_workflow_policies ORDER BY project_id;

SELECT run_id, project_id, route_repository, route_github_installation_id,
       route_revision, route_digest
FROM orchestration_runs
WHERE status IN ('pending_dispatch', 'active', 'awaiting_human',
                 'awaiting_capability', 'manual_reconciliation_required')
ORDER BY run_id;
```

## Canary enablement

Use the Access-protected Settings page to add or edit routes. The repository picker contains only repositories returned by the DEOS GitHub App. A new route starts off. Recheck GitHub access, then enable only the intended canary route. Read the saved D1 row after each action. Do not enable a route with direct SQL because the Settings save also advances the guarded revisions and recomputes the route digest.

Use Linear MCP to move a dedicated test issue to `In Progress`. The provider-originated delivery, not a locally signed payload, is the canary proof.

For definition version 11, verify the registered canonical graph before enabling dispatch: `openspec_verify` must lead to `final_approval`, approval must lead directly to `sync_and_archive`, rejection must lead to `denied`, and the snapshot must contain neither `deploy` nor `release_finalization`. Use a deliberately small repository-local OpenSpec change. The run must wait for real authorized-human deliveries at its configured gates; an agent-originated or synthetic approval is not evidence.

After final approval, inspect the `sync_and_archive` attempt's bounded `job_spec_json` for exact `/opsx:archive`, trusted change identity, and the latest continuation-patch reference. Require `state='completed'`, `cleanup_state='destroyed'`, a complete manifest, and a visit-aware transition from `sync_and_archive` to `done`. Retrieve the final `patch.diff` from R2 into a protected temporary location, verify its SHA-256 against D1, and inspect it for the archived change plus applicable main-spec synchronization. The same run must end with business status `succeeded`, and no attempt or transition may name `deploy` or `release_finalization`.

When evidence capture is complete, disable the canary route in Settings and read back its project id, definition, route revision, route digest, and disabled state.

Also confirm every canary attempt is terminal with `cleanup_state='destroyed'` and compare Cloudflare Sandbox inventory to D1 before declaring the proof complete.

During an explicit debug window, list retained failures without reading job or
artifact contents:

```sql
SELECT attempt_id, sandbox_id, run_id, state, cleanup_state,
       cleanup_hold_until, cleanup_hold_reason
FROM agent_attempts
WHERE cleanup_hold_until IS NOT NULL
ORDER BY cleanup_hold_until;
```

Return `SANDBOX_FAILURE_RETENTION_MINUTES` to `0`, deploy, and wait for every
hold to expire before the final cleanup proof.

## Inspection

Use read-only D1 queries for `deliveries`, `orchestration_runs`, `dispatch_intents`, `workflow_event_inbox`, `workflow_waits`, `workflow_wait_deliveries`, `workflow_completion_reconciliations`, `agent_attempts`, `artifact_manifests`, `artifacts`, `provider_operations`, `workflow_transitions_v2`, and `cleanup_work_items`. For OpenSpec nodes, inspect only bounded `job_spec_json` fields for `openspecInstruction`, `openspecChange`, and `continuationPatch`; verify the referenced patch through its recorded digest without printing arbitrary source or transcript content. Verify `terminal_cause` only from the bounded allowlist and correlate Workers Logs by `deos.workflow.correlation_id` and `deos.workflow.run_id`. Do not query or log raw prompts, transcripts, auth envelopes, tokens, matcher-external provider fields, or provider response bodies.

For migration rehearsal and post-apply inspection, use read-only queries equivalent to:

```sql
SELECT status, COUNT(*) FROM orchestration_runs GROUP BY status ORDER BY status;
PRAGMA foreign_key_check;
SELECT run_id, node_id, status, resume_event_type, cancel_event_type
FROM workflow_waits ORDER BY created_at DESC LIMIT 20;
SELECT run_id, safe_cause, observed_executor_status, observed_run_status, state
FROM workflow_completion_reconciliations ORDER BY created_at DESC LIMIT 20;
```

The scheduled GitHub workflow reads `wrangler containers instances ... --json` and submits only Sandbox IDs to `/cleanup-audit`. It holds Cloudflare inventory and cleanup-audit credentials; Linear credentials remain in the Worker.

If a Workflow executor errors while an attempt is stuck in `collecting`, an
operator can submit the exact tracked `attemptId`, `sandboxId`, and D1
`expectedUpdatedAt` to `POST /cleanup-attempts` with the cleanup-audit bearer
credential. The Worker rejects a changed record or running process. A valid
request compare-and-sets the attempt to `interrupted`, destroys only that
Sandbox, and records `cleanup_state='destroyed'`. Repeating an already completed
request is safe.

## Rollback

First disable each intended route through Settings and read it back. Queue deliveries remain authenticated and auditable but cannot create a new run. Existing Workflow mappings and their frozen repositories remain available for inspection. If Settings is unavailable, an exact-project D1 update that only changes `dispatch_enabled` to `0` is an emergency stop. It intentionally leaves the route proof stale; do not re-enable it until Settings has run a fresh access check and saved a new revision and digest.

Then deploy the prior Worker version and point new policies back to the version 3 definition. The expanded schema is retained: migrations are not reversed, and existing version 4 runs are explicitly canceled or reconciled rather than downgraded. Never delete D1 rows, waits, reconciliation history, Workflow history, R2 manifests, or credential envelopes during rollback. For every nonterminal attempt, disable keep-alive, destroy its exact Sandbox ID, and verify `cleanup_state='destroyed'`. If provider inventory still shows a resource, submit it to `/cleanup-audit` and keep the generated Linear cleanup issue open until replacement evidence is recorded.
