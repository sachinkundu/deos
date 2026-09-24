# SAC-257 live recovery readback

*2026-09-24T14:03:44Z by Showboat 0.6.1*
<!-- showboat-id: adb11f48-481c-419a-b456-2a860c6b9bc3 -->

Read-only D1 proof after the authenticated recovery of SAC-253. This snapshot can change as the agent progresses. The command loads operator credentials from the ignored local .env and prints no secret values.

```bash
set -euo pipefail
set -a
source /Users/sachin/code/deos/.env
set +a
export CLOUDFLARE_API_TOKEN="$CLOUDFLARE_TOKEN"
json="$(npx wrangler d1 execute DB --remote --config wrangler.queue-consumer-ts.jsonc --command "SELECT current_node, current_visit_sequence, status, workflow_instance_id FROM orchestration_runs WHERE run_id = 'workflow:2a653831-c1ec-4db7-972a-d0d08ac0a3d8:c9b7b008-f13b-4d58-bc55-64b84775d161:run:1'; SELECT attempt_id, node_id, state, heartbeat_at, ended_at FROM agent_attempts WHERE run_id = 'workflow:2a653831-c1ec-4db7-972a-d0d08ac0a3d8:c9b7b008-f13b-4d58-bc55-64b84775d161:run:1' AND visit_sequence = 29; SELECT recovery_id, state, workflow_status FROM workflow_runtime_recoveries WHERE source_workflow_instance_id = 'wf-v1-damou7utv346kimsxvkcmkru7fi27jyvcgxvikbuok2ranip6mva';" --json)"
node -e 'const payload=JSON.parse(process.argv[1]);for (const batch of payload) console.log(JSON.stringify(batch.results))' "$json"

```

```output
[{"current_node":"design_revision_author","current_visit_sequence":29,"status":"active","workflow_instance_id":"wf-v1-d77k7kwpscvyo4zkrhcneh7w24estt7k6ntpy4dmz24xym45v2rq"}]
[{"attempt_id":"01a0d3b5-f884-7906-a4d9-bfa8f73ab6d8","node_id":"design_revision_author","state":"running","heartbeat_at":"2026-09-24T13:58:53.672Z","ended_at":null}]
[{"recovery_id":"workflow-runtime-recovery:wf-v1-damou7utv346kimsxvkcmkru7fi27jyvcgxvikbuok2ranip6mva","state":"established","workflow_status":"queued"}]
```
