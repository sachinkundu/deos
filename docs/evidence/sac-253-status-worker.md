# SAC-253 status Worker remote proof

*2026-09-26T11:37:14Z by Showboat 0.6.1*
<!-- showboat-id: 9c3f81dd-d8e6-480c-a0b1-868a6bb1e184 -->

```bash
source /Users/sachin/code/deos/.env && CLOUDFLARE_API_TOKEN="$CLOUDFLARE_TOKEN" python3 scripts/check_shared_test_bootstrap.py
```

```output
{"activeAttempts": [], "migration": {"name": "0055_shared_test_environment.sql"}, "pointer": {"manifest_id": null, "revision": 0, "state": "uninitialized"}, "site": {"fence": 0, "owner_lease_id": null, "owner_run_id": null, "state": "free"}}
```

```bash
source /Users/sachin/code/deos/.env && CLOUDFLARE_API_TOKEN="$CLOUDFLARE_TOKEN" npx --no-install wrangler deploy --config portal/test-environment/wrangler.jsonc
```

```output

 ⛅️ wrangler 4.125.0 (update available 4.141.0)
───────────────────────────────────────────────
Total Upload: 57.08 KiB / gzip: 13.52 KiB
Worker Startup Time: 2 ms
Your Worker has access to the following bindings:
Binding                                                                  Resource                  
env.DB (deos-sample-project)                                             D1 Database               
env.ARTIFACTS (deos-sample-project-artifacts)                            R2 Bucket                 
env.ACCESS_TEAM_DOMAIN ("deos-voxdez.cloudflareaccess.com")              Environment Variable      
env.ACCESS_AUD ("c12828abda88ac73e394039f6e0b87a9bc5f2...")              Environment Variable      
env.ALLOWED_EMAIL ("sachinkundu@gmail.com")                              Environment Variable      

Uploaded deos-shared-test-portal (4.00 sec)

[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mA request to the Cloudflare API (/zones/8a120356c46d1557fbf7fec6cbed7a19/workers/routes) failed.[0m

  No access to the specified resource.
  
  If you think this is a bug, please open an issue at: [4mhttps://github.com/cloudflare/workers-sdk/issues/new/choose[0m


🪵  Logs were written to "/Users/sachin/Library/Preferences/.wrangler/logs/wrangler-2026-09-26_11-37-25_454.log"
```

```bash
source /Users/sachin/code/deos/.env && CLOUDFLARE_API_TOKEN="$CLOUDFLARE_TOKEN" npx --no-install wrangler deployments list --name deos-shared-test-portal --config portal/test-environment/wrangler.jsonc --json
```

```output
[
  {
    "id": "bd8b192f-3d7b-4d8a-bf27-c92354763a53",
    "source": "wrangler",
    "strategy": "percentage",
    "author_email": "sachin.kundu@pm.me",
    "annotations": {
      "workers/message": "Automatic deployment on upload.",
      "workers/triggered_by": "upload"
    },
    "versions": [
      {
        "version_id": "f549cac6-80cd-460f-8f15-a604d4cd5347",
        "percentage": 100
      }
    ],
    "created_on": "2026-09-26T11:37:31.063844Z"
  }
]
```

The upload activated version f549cac6-80cd-460f-8f15-a604d4cd5347 at 100% traffic, but Wrangler could not attach the custom domain because the local token has Workers Routes Read rather than Write. A Brave visit to https://deos-test.voxdez.com/ returned DNS name not resolved. This is deployment progress only; the status page is not live, and no test lease or provider canary has run.
