# Cloudflare deployment and rollback

DEOS has two deployable Workers sharing D1 and Queue resources:

- `deos-sample-project` is the small Python Linear webhook ingress.
- `deos-queue-consumer-ts` owns dispatch, Cloudflare Workflow, Sandbox, provider capabilities, artifacts, and cleanup reconciliation.

The orchestration rollout is additive. Keep `TRIAL_DISPATCH_ENABLED` false while creating bindings, applying migrations, uploading secrets, and deploying the pinned Container image. Enabling a project policy in D1 is the separate canary action.

## Required resources

The checked Wrangler configurations name the existing D1 database, Queue, and private R2 bucket. The TypeScript configuration additionally creates:

- Workflow `deos-sandbox-codex-workflow` with entrypoint `DeosWorkflow`;
- Durable Object class `Sandbox` and its pinned Container image;
- a Queue consumer and fifteen-minute D1-known cleanup cron.

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
```

Set `LINEAR_APP_ACTOR_ID` to the actor ID observed for the Linear OAuth app, and `LINEAR_TEAM_ID` to the cleanup issue team. The checked configuration carries the verified non-secret IDs for this controlled workspace. The deploy script refuses to continue if a future configuration restores a `configure-before-*` sentinel. Prefer `GITHUB_APP_PRIVATE_KEY_PATH` so the PEM remains in its protected file rather than a shell environment variable.

Provider credentials exist only in the trusted Worker. The Sandbox receives a short-lived, attempt-scoped capability token, never a Linear token, GitHub token, GitHub App key, Cloudflare token, or encryption key.

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

Remove the temporary directory after verifying the object exists. Each attempt acquires an exclusive D1 lease, decrypts into `/root/.codex/auth.json`, preserves a refreshed file with conditional R2 replacement, deletes it before artifact collection, and releases the lease. A conditional conflict fails closed.

## Deploy disabled

With a Docker-compatible daemon available:

```sh
set -a
. ./.env
set +a
./scripts/deploy-orchestration.sh
```

Then deploy ingress with `LINEAR_WEBHOOK_SECRET` using `./scripts/deploy-cloudflare.sh`. Inspect bindings and resources before enabling dispatch:

```sh
npx wrangler d1 migrations list DB --remote --config wrangler.queue-consumer-ts.jsonc
npx wrangler workflows list --config wrangler.queue-consumer-ts.jsonc
npx wrangler r2 object get deos-sample-project-artifacts/credentials/controlled-trial/auth.v1.enc --remote
```

Do not print the downloaded credential object. A presence/head-style inspection is sufficient.

## Canary enablement

Enable only the configured test project after disabled deployment and one real Sandbox integration attempt succeed:

```sql
UPDATE project_workflow_policies
SET dispatch_enabled = 1, updated_at = datetime('now')
WHERE project_id = '99426d9b-cda7-4db4-9136-692a95a0b090';
```

Apply that statement through `wrangler d1 execute ... --remote --command`. Use Linear MCP to move a dedicated test issue to `In Progress`. The provider-originated delivery, not a locally signed payload, is the canary proof.

For definition version 10, verify the registered canonical graph before enabling dispatch: `openspec_verify` must lead to `final_approval`, approval must lead directly to `sync_and_archive`, and the snapshot must contain neither `deploy` nor `release_finalization`. Use a deliberately small repository-local OpenSpec change. The run must wait for real authorized-human deliveries at its configured gates; an agent-originated or synthetic approval is not evidence.

After final approval, inspect the `sync_and_archive` attempt's bounded `job_spec_json` for exact `/opsx:archive`, trusted change identity, and the latest continuation-patch reference. Require `state='completed'`, `cleanup_state='destroyed'`, a complete manifest, and a visit-aware transition from `sync_and_archive` to `done`. Retrieve the final `patch.diff` from R2 into a protected temporary location, verify its SHA-256 against D1, and inspect it for the archived change plus applicable main-spec synchronization. The same run must end with business status `succeeded`, and no attempt or transition may name `deploy` or `release_finalization`.

When evidence capture is complete, disable dispatch and read it back:

```sql
UPDATE project_workflow_policies
SET dispatch_enabled = 0, updated_at = datetime('now')
WHERE project_id = '99426d9b-cda7-4db4-9136-692a95a0b090';

SELECT project_id, definition_id, definition_version, dispatch_enabled
FROM project_workflow_policies
WHERE project_id = '99426d9b-cda7-4db4-9136-692a95a0b090';
```

Also confirm every canary attempt is terminal with `cleanup_state='destroyed'` and compare Cloudflare Sandbox inventory to D1 before declaring the proof complete.

## Inspection

Use read-only D1 queries for `deliveries`, `orchestration_runs`, `dispatch_intents`, `workflow_event_inbox`, `agent_attempts`, `artifact_manifests`, `artifacts`, `provider_operations`, `workflow_transitions_v2`, and `cleanup_work_items`. For OpenSpec nodes, inspect only bounded `job_spec_json` fields for `openspecInstruction`, `openspecChange`, and `continuationPatch`; verify the referenced patch through its recorded digest without printing arbitrary source or transcript content. Correlate Workers Logs by `deos.workflow.correlation_id` and `deos.workflow.run_id`. Do not query or log raw prompts, transcripts, auth envelopes, tokens, or provider response bodies.

The scheduled GitHub workflow reads `wrangler containers instances ... --json` and submits only Sandbox IDs to `/cleanup-audit`. It holds Cloudflare inventory and cleanup-audit credentials; Linear credentials remain in the Worker.

## Rollback

First disable project dispatch in D1. Queue deliveries remain authenticated and auditable but cannot create a new run. Existing Workflow mappings remain available for inspection.

Then deploy the prior Worker version. Migrations are additive and are not reversed. Never delete D1 rows, Workflow history, R2 manifests, or credential envelopes during rollback. For every nonterminal attempt, disable keep-alive, destroy its exact Sandbox ID, and verify `cleanup_state='destroyed'`. If provider inventory still shows a resource, submit it to `/cleanup-audit` and keep the generated Linear cleanup issue open until replacement evidence is recorded.
