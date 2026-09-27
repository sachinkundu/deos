# SAC-253 public proof Worker readback

*2026-09-27T10:34:10Z by Showboat 0.6.1*
<!-- showboat-id: c4f608ee-535e-44f3-aa84-3e88eb4f3d8c -->

The safe-image Worker was deployed from commit 80cb4ed. It exposes no raw capture route. This probe uses a nonexistent proof ID; 404 confirms the public route and D1 classification check are active. The deployment readback below confirms the uploaded version serves 100% of traffic.

```bash
curl -sS -w "\nHTTP %{http_code}\n" https://deos-shared-test-proof.skundu.workers.dev/proof/00000000-0000-0000-0000-000000000000
```

```output
{"error":"proof_not_found"}
HTTP 404
```

```bash
. /Users/sachin/code/deos/.env; CLOUDFLARE_API_TOKEN="$CLOUDFLARE_TOKEN" npx wrangler deployments list --name deos-shared-test-proof --config portal/test-proof/wrangler.jsonc --json | jq -c ".[0].versions"
```

```output
[{"version_id":"3a75e8f7-226c-418d-95da-3ebf56e14b57","percentage":100}]
```
