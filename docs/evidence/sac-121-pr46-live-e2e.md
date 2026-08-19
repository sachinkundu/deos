# SAC-121 PR #46 live provider E2E

*2026-08-19T08:44:41Z by Showboat 0.6.1*
<!-- showboat-id: ffb5ca7a-924b-4865-8dca-8910294c450f -->

This record ties a fresh provider-originated Linear canary to PR #46 head ccef9532200fdbdb24b1aa981df31e8f21d2ed6d. DEOS/D1 business state is reported before Cloudflare executor state; synthetic ingress and test results are not used as end-to-end proof.

```bash
set -euo pipefail
set -a
source /Users/sachin/code/deos/.env
set +a
export CLOUDFLARE_API_TOKEN="${CLOUDFLARE_API_TOKEN:-$CLOUDFLARE_TOKEN}"
rtk npx wrangler d1 migrations list DB --remote --config wrangler.queue-consumer-ts.jsonc
rtk npx wrangler d1 execute DB --remote --config wrangler.queue-consumer-ts.jsonc --command "SELECT project_id, definition_id, definition_version, dispatch_enabled, updated_at FROM project_workflow_policies; SELECT COUNT(*) AS active_runs FROM orchestration_runs WHERE status IN ('pending_dispatch', 'active', 'awaiting_human', 'awaiting_capability', 'manual_reconciliation_required'); SELECT COUNT(*) AS live_attempts FROM agent_attempts WHERE state IN ('pending', 'starting', 'running', 'collecting'); PRAGMA foreign_key_check;" --json | jq -c 'map(.results)'
rtk npx wrangler versions list --config wrangler.queue-consumer-ts.jsonc --json | jq -c '.[-1] | {id, created_on: .metadata.created_on}'
```

```output
 ⛅️ wrangler 4.123.0
────────────────────
Resource location: remote 
Migrations to be applied:
┌──────────────────────────────────────┐
│ Name                                 │
├──────────────────────────────────────┤
│ 0008_explicit_business_lifecycle.sql │
└──────────────────────────────────────┘
[[{"project_id":"99426d9b-cda7-4db4-9136-692a95a0b090","definition_id":"openspec-delivery","definition_version":10,"dispatch_enabled":0,"updated_at":"2026-08-18T11:09:56.015Z"}],[{"active_runs":0}],[{"live_attempts":0}],[]]
{"id":"ebc94259-3ee0-485d-b8a2-0d314f09c8cf","created_on":"2026-08-18T11:04:58.614775Z"}
```

Preflight found dispatch disabled, no active business runs or live attempts, a clean foreign-key check, and only the PR migration pending. The migration and Worker deployment therefore proceed while admission remains disabled.

```bash
set -euo pipefail
set -a
source /Users/sachin/code/deos/.env
set +a
export CLOUDFLARE_API_TOKEN="${CLOUDFLARE_API_TOKEN:-$CLOUDFLARE_TOKEN}"
rtk npx wrangler d1 migrations apply DB --remote --config wrangler.queue-consumer-ts.jsonc
rtk npx wrangler deploy --config wrangler.queue-consumer-ts.jsonc --containers-rollout gradual
```

```output
 ⛅️ wrangler 4.123.0 (update available 4.124.0)
───────────────────────────────────────────────
Resource location: remote 
Migrations to be applied:
┌──────────────────────────────────────┐
│ name                                 │
├──────────────────────────────────────┤
│ 0008_explicit_business_lifecycle.sql │
└──────────────────────────────────────┘
? About to apply 1 migration(s)
Your database may not be available to serve requests during the migration, continue?
🤖 Using fallback value in non-interactive context: yes
🌀 Executing on remote database DB (4e854f8a-018a-42c4-a325-c4b8805c06b2):
🌀 To execute on your local development database, remove the --remote flag from your wrangler command.
[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mA request to the Cloudflare API (/accounts/c68856288112af7698f5be52ea94b96e/d1/database/4e854f8a-018a-42c4-a325-c4b8805c06b2/query) failed.[0m
  table workflow_waits already exists at offset 13: SQLITE_ERROR [code: 7500]
  If you think this is a bug, please open an issue at: [4mhttps://github.com/cloudflare/workers-sdk/issues/new/choose[0m
🪵  Logs were written to "/Users/sachin/Library/Preferences/.wrangler/logs/wrangler-2026-08-19_08-44-57_735.log"
```

The first rollout attempt failed safely before Worker deployment: the target database already contains the lifecycle wait tables from the previously deployed SAC-92 build. This is actionable E2E evidence of a source-reconciliation migration defect; no canary was admitted.

```bash
set -euo pipefail
set -a
source /Users/sachin/code/deos/.env
set +a
export CLOUDFLARE_API_TOKEN="${CLOUDFLARE_API_TOKEN:-$CLOUDFLARE_TOKEN}"
rtk npx wrangler d1 migrations list DB --remote --config wrangler.queue-consumer-ts.jsonc
rtk npx wrangler d1 execute DB --remote --config wrangler.queue-consumer-ts.jsonc --command "SELECT name, sql FROM sqlite_schema WHERE type='table' AND name IN ('orchestration_runs','workflow_waits','workflow_wait_deliveries','workflow_completion_reconciliations') ORDER BY name; SELECT name FROM pragma_table_info('orchestration_runs') ORDER BY cid; SELECT name FROM d1_migrations ORDER BY id; SELECT project_id, definition_version, dispatch_enabled FROM project_workflow_policies;" --json | jq -c 'map(.results)'
```

```output
 ⛅️ wrangler 4.123.0 (update available 4.124.0)
───────────────────────────────────────────────
Resource location: remote 
Migrations to be applied:
┌──────────────────────────────────────┐
│ Name                                 │
├──────────────────────────────────────┤
│ 0008_explicit_business_lifecycle.sql │
└──────────────────────────────────────┘
[[{"name":"orchestration_runs","sql":"CREATE TABLE \"orchestration_runs\" (\n    run_id TEXT PRIMARY KEY,\n    correlation_id TEXT NOT NULL,\n    run_sequence INTEGER NOT NULL CHECK (run_sequence > 0),\n    project_id TEXT NOT NULL,\n    issue_id TEXT NOT NULL,\n    definition_id TEXT NOT NULL,\n    definition_version INTEGER NOT NULL,\n    definition_digest TEXT NOT NULL,\n    workflow_instance_id TEXT NOT NULL UNIQUE,\n    previous_node TEXT,\n    current_node TEXT NOT NULL,\n    gate_origin_node TEXT,\n    status TEXT NOT NULL CHECK (\n        status IN (\n            'pending_dispatch', 'active', 'awaiting_human',\n            'awaiting_capability', 'manual_reconciliation_required',\n            'blocked', 'succeeded', 'denied', 'failed', 'canceled'\n        )\n    ),\n    accumulated_data_json TEXT NOT NULL DEFAULT '{}',\n    created_at TEXT NOT NULL,\n    updated_at TEXT NOT NULL,\n    terminal_at TEXT,\n    terminal_cause TEXT, current_visit_sequence INTEGER NOT NULL DEFAULT 1\nCHECK (current_visit_sequence > 0), last_transition_id TEXT,\n    UNIQUE (project_id, issue_id, run_sequence),\n    FOREIGN KEY (definition_id, definition_version)\n        REFERENCES workflow_definitions(definition_id, version)\n)"},{"name":"workflow_completion_reconciliations","sql":"CREATE TABLE workflow_completion_reconciliations (\n    reconciliation_id TEXT PRIMARY KEY,\n    run_id TEXT NOT NULL,\n    workflow_instance_id TEXT NOT NULL,\n    safe_cause TEXT NOT NULL,\n    observed_executor_status TEXT NOT NULL,\n    observed_run_status TEXT NOT NULL,\n    observed_node TEXT NOT NULL,\n    state TEXT NOT NULL CHECK (state IN ('pending_notice', 'notified', 'conflict')),\n    linear_operation_key TEXT NOT NULL UNIQUE,\n    linear_resource_id TEXT,\n    created_at TEXT NOT NULL,\n    updated_at TEXT NOT NULL,\n    FOREIGN KEY (run_id) REFERENCES orchestration_runs(run_id),\n    UNIQUE (run_id, safe_cause)\n)"},{"name":"workflow_wait_deliveries","sql":"CREATE TABLE workflow_wait_deliveries (\n    delivery_id TEXT PRIMARY KEY,\n    wait_id TEXT NOT NULL,\n    run_id TEXT NOT NULL,\n    decision TEXT NOT NULL CHECK (\n        decision IN ('resumed', 'canceled', 'rejected', 'already_consumed')\n    ),\n    safe_reason TEXT NOT NULL,\n    occurred_at TEXT NOT NULL,\n    FOREIGN KEY (delivery_id) REFERENCES workflow_event_inbox(delivery_id),\n    FOREIGN KEY (wait_id) REFERENCES workflow_waits(wait_id),\n    FOREIGN KEY (run_id) REFERENCES orchestration_runs(run_id)\n)"},{"name":"workflow_waits","sql":"CREATE TABLE workflow_waits (\n    wait_id TEXT PRIMARY KEY,\n    run_id TEXT NOT NULL,\n    node_id TEXT NOT NULL,\n    status TEXT NOT NULL CHECK (status IN ('awaiting', 'consumed', 'canceled')),\n    resume_event_type TEXT NOT NULL,\n    resume_event_json TEXT NOT NULL,\n    resume_event_digest TEXT NOT NULL,\n    cancel_event_type TEXT NOT NULL,\n    cancel_event_json TEXT NOT NULL,\n    cancel_event_digest TEXT NOT NULL,\n    cause_reference TEXT NOT NULL,\n    created_at TEXT NOT NULL,\n    consumed_delivery_id TEXT UNIQUE,\n    consumed_at TEXT,\n    FOREIGN KEY (run_id) REFERENCES orchestration_runs(run_id),\n    FOREIGN KEY (consumed_delivery_id) REFERENCES workflow_event_inbox(delivery_id),\n    UNIQUE (run_id, node_id, wait_id)\n)"}],[{"name":"run_id"},{"name":"correlation_id"},{"name":"run_sequence"},{"name":"project_id"},{"name":"issue_id"},{"name":"definition_id"},{"name":"definition_version"},{"name":"definition_digest"},{"name":"workflow_instance_id"},{"name":"previous_node"},{"name":"current_node"},{"name":"gate_origin_node"},{"name":"status"},{"name":"accumulated_data_json"},{"name":"created_at"},{"name":"updated_at"},{"name":"terminal_at"},{"name":"terminal_cause"},{"name":"current_visit_sequence"},{"name":"last_transition_id"}],[{"name":"0001_initial.sql"},{"name":"0002_workflow_dispatch.sql"},{"name":"0003_queue_consumptions.sql"},{"name":"0004_idempotent_workflow_transitions.sql"},{"name":"0005_workflow_correlation.sql"},{"name":"0006_sandbox_orchestration.sql"},{"name":"0007_explicit_business_lifecycle.sql"},{"name":"0007_workflow_visit_identity.sql"}],[{"project_id":"99426d9b-cda7-4db4-9136-692a95a0b090","definition_version":10,"dispatch_enabled":0}]]
```
