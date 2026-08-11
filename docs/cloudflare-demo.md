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
