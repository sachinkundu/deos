# Cloudflare ingress demonstration

*2026-08-11T14:59:08Z by Showboat 0.6.1*
<!-- showboat-id: 5d663978-6a98-4157-8003-1ae7b62d9298 -->

This is a live demonstration against the deployed Worker, D1, Queue configuration, and R2 account resource. It exercises the signed Linear webhook path and captures the real remote responses.

```bash
/tmp/deos-showboat-live.sh
```

```output
first=202 accepted
duplicate=200 duplicate
        "classification": "relevant"
    "success": true,
```

The same deployed configuration includes the R2 provenance bucket. The next captured command queries the live Cloudflare account rather than a local fixture.

```bash
NPM_CONFIG_CACHE=/tmp/deos-npm-cache npx --yes wrangler r2 bucket list 2>&1 | rtk sed -n "/name:/,+1p"
```

```output
name:           deos-sample-project-artifacts
creation_date:  2026-08-11T14:45:46.491Z
```

Important boundary: this captured request was generated locally and sent directly to the Worker with a valid Linear-compatible signature. No Linear webhook is currently registered, so this does not yet prove that Linear itself emitted the delivery.

Genuine Linear-originated delivery: after the webhook was enabled, Linear MCP moved SAC-73 from Backlog to In Progress. The Worker version with the real Linear status filter recorded the resulting delivery in remote D1 as relevant.

```bash
rtk curl -sS -X POST "https://api.cloudflare.com/client/v4/accounts/c68856288112af7698f5be52ea94b96e/d1/database/4e854f8a-018a-42c4-a325-c4b8805c06b2/query" -H "Authorization: Bearer $(sed -n "s/^CLOUDFLARE_TOKEN=//p" .env)" -H "Content-Type: application/json" --data "{\"sql\":\"SELECT delivery_id, classification, received_at FROM deliveries ORDER BY received_at DESC LIMIT 1\"}"
```

```output
{"result":[{"results":[{"delivery_id":"e76fc6cd-b193-4ef0-b956-5d982e993104","classification":"relevant","received_at":"2026-08-11T16:08:23.958000+00:00"}],"success":true,"meta":{"served_by":"v3-prod","served_by_region":"WEUR","served_by_colo":"AMS","served_by_primary":true,"timings":{"sql_duration_ms":0.5919},"duration":0.5919,"changes":0,"last_row_id":0,"changed_db":false,"size_after":32768,"rows_read":24,"rows_written":0,"total_attempts":1}}],"errors":[],"messages":[],"success":true}
```
