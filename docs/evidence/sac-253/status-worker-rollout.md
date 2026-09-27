# SAC-253 status Worker deployment readback

*2026-09-27T08:57:02Z by Showboat 0.6.1*
<!-- showboat-id: 58e6f812-8c9a-49d1-a217-d8e2b01893b7 -->

The status Worker is read-only. The shared D1 owner row was free before deployment. Cloudflare reports the new Worker version at 100% traffic. The status hostname remains protected by Access; an unauthenticated request gets 401. An authenticated browser visit remains to be checked after the Access eager redirect setting is changed.

```bash
npx wrangler deployments list --config portal/test-environment/wrangler.jsonc | sed -E 's/Author:.*/Author: [redacted]/'
```

```output

 ⛅️ wrangler 4.125.0 (update available 4.141.0)
───────────────────────────────────────────────
Created:     2026-09-26T11:37:31.063Z
Author: [redacted]
Source:      Upload
Message:     Automatic deployment on upload.
Version(s):  (100%) f549cac6-80cd-460f-8f15-a604d4cd5347
                 Created:  2026-09-26T11:37:31.063Z
                     Tag:  -
                 Message:  -

Created:     2026-09-27T08:56:34.175Z
Author: [redacted]
Source:      Unknown (deployment)
Message:     -
Version(s):  (100%) 5009b9f3-a973-4151-bbac-c10a3f87694e
                 Created:  2026-09-27T08:56:32.930Z
                     Tag:  -
                 Message:  -
```

```bash
npx wrangler d1 execute deos-sample-project --remote --config portal/test-environment/wrangler.jsonc --command 'SELECT state,owner_run_id,owner_lease_id,fence FROM test_environment WHERE site_id=1' --json
```

```output
[
  {
    "results": [
      {
        "state": "free",
        "owner_run_id": null,
        "owner_lease_id": null,
        "fence": 0
      }
    ],
    "success": true,
    "meta": {
      "served_by": "v3-prod",
      "served_by_region": "WEUR",
      "served_by_colo": "AMS",
      "served_by_primary": true,
      "timings": {
        "sql_duration_ms": 1.1831
      },
      "duration": 1.1831,
      "changes": 0,
      "last_row_id": 0,
      "changed_db": false,
      "size_after": 155054080,
      "rows_read": 1,
      "rows_written": 0,
      "total_attempts": 1
    }
  }
]
```

```bash
curl -sS -o /dev/null -w '%{http_code} %{url_effective}\n' https://deos-test.voxdez.com/
```

```output
401 https://deos-test.voxdez.com/
```
