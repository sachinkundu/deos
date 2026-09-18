# SAC-246 behavior proof

1. The real deployed shelf starts with healthy Alpha and the explicitly synthetic Broken delete failure fixture.
Captured from https://deos-tmp-29e1a604cd5e918d7382569b.skundu.workers.dev/; Chromium inside the implementation sandbox

   ![The real deployed shelf starts with healthy Alpha and the explicitly synthetic Broken delete failure fixture.
Captured from https://deos-tmp-29e1a604cd5e918d7382569b.skundu.workers.dev/; Chromium inside the implementation sandbox](images/5f9926a2eacdbfbfdf854ec1c9ce3949b011a6c501b2b30fac94cc34fb3ed1d4.png)

2. The deployed app reports that Broken delete could not be read and clears the reader instead of showing stale text.
Captured from https://deos-tmp-29e1a604cd5e918d7382569b.skundu.workers.dev/; Chromium inside the implementation sandbox

   ![The deployed app reports that Broken delete could not be read and clears the reader instead of showing stale text.
Captured from https://deos-tmp-29e1a604cd5e918d7382569b.skundu.workers.dev/; Chromium inside the implementation sandbox](images/d1e8e07f6c940de47607ea6b8415ca4c11dabe55d037bdeae7bfe10985499af0.png)

3. The failed delete is reported without false success; Broken delete remains available for retry after authoritative D1 reload.
Captured from https://deos-tmp-29e1a604cd5e918d7382569b.skundu.workers.dev/; Chromium inside the implementation sandbox

   ![The failed delete is reported without false success; Broken delete remains available for retry after authoritative D1 reload.
Captured from https://deos-tmp-29e1a604cd5e918d7382569b.skundu.workers.dev/; Chromium inside the implementation sandbox](images/2b98e7750a54a71ea9f9684c4342e6b8077fb45e847f375b07660aae14837db6.png)

# sac-246 behavior check

*2026-09-18T09:04:01Z by Showboat 0.6.1*
<!-- showboat-id: 3e0df06a-a80a-47ae-8a85-debec7cbef76 -->

```bash
'runuser' '-u' 'deos-author' '--' 'env' '-i' 'PATH=/usr/local/bin:/usr/bin:/bin' 'HOME=/home/deos-author' 'NODE_EXTRA_CA_CERTS=/etc/cloudflare/certs/cloudflare-containers-ca.crt' 'node' 'scripts/verify-remote-storage.mjs' '/deos/output/requests/query-snippets-failure-proof-feedback.json' '/deos/output/requests/query-operations-failure-proof-feedback.json' '/deos/output/requests/objects-failure-proof-feedback.json' '/deos/output/requests/object-alpha-failure-proof-feedback.json'

```

```output
## query-snippets-failure-proof-feedback.json
{
  "request": {
    "operation": "query",
    "sql": "SELECT s.id, s.title, s.object_key, o.state, o.reserved_bytes FROM snippets s JOIN snippet_operations o ON o.id = s.id ORDER BY s.title"
  },
  "environment": "deos-tmp-29e1a604cd5e918d7382569b",
  "result": {
    "success": true,
    "meta": {
      "served_by": "v3-prod",
      "served_by_region": "EEUR",
      "served_by_colo": "FRA",
      "served_by_primary": true,
      "timings": {
        "sql_duration_ms": 0.7813
      },
      "duration": 0.7813,
      "changes": 0,
      "last_row_id": 0,
      "changed_db": false,
      "size_after": 53248,
      "rows_read": 6,
      "rows_written": 0,
      "total_attempts": 1
    },
    "results": [
      {
        "id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        "title": "Alpha",
        "object_key": "snippets/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/c3ecd0c0cda2d22a8bd294675346f603cc2334076c77974f44757669834904ae.txt",
        "state": "active",
        "reserved_bytes": 10
      },
      {
        "id": "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        "title": "Broken delete",
        "object_key": "snippets/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee/index-key.txt",
        "state": "active",
        "reserved_bytes": 13
      }
    ]
  }
}
## query-operations-failure-proof-feedback.json
{
  "request": {
    "operation": "query",
    "sql": "SELECT id, state, reserved_bytes FROM snippet_operations ORDER BY created_at, id"
  },
  "environment": "deos-tmp-29e1a604cd5e918d7382569b",
  "result": {
    "success": true,
    "meta": {
      "served_by": "v3-prod",
      "served_by_region": "EEUR",
      "served_by_colo": "FRA",
      "served_by_primary": true,
      "timings": {
        "sql_duration_ms": 0.6318
      },
      "duration": 0.6318,
      "changes": 0,
      "last_row_id": 0,
      "changed_db": false,
      "size_after": 53248,
      "rows_read": 10,
      "rows_written": 0,
      "total_attempts": 1
    },
    "results": [
      {
        "id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        "state": "active",
        "reserved_bytes": 10
      },
      {
        "id": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        "state": "deleted",
        "reserved_bytes": 0
      },
      {
        "id": "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        "state": "deleted",
        "reserved_bytes": 0
      },
      {
        "id": "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        "state": "deleted",
        "reserved_bytes": 0
      },
      {
        "id": "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        "state": "active",
        "reserved_bytes": 13
      }
    ]
  }
}
## objects-failure-proof-feedback.json
{
  "request": {
    "operation": "objects"
  },
  "environment": "deos-tmp-29e1a604cd5e918d7382569b",
  "result": {
    "objects": [
      {
        "key": "snippets/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/c3ecd0c0cda2d22a8bd294675346f603cc2334076c77974f44757669834904ae.txt",
        "size": 10,
        "etag": "b1710d7a9a14ce821e2bfe83421c71ef"
      }
    ],
    "truncated": false,
    "cursor": null
  }
}
## object-alpha-failure-proof-feedback.json
{
  "request": {
    "operation": "object",
    "key": "snippets/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/c3ecd0c0cda2d22a8bd294675346f603cc2334076c77974f44757669834904ae.txt"
  },
  "environment": "deos-tmp-29e1a604cd5e918d7382569b",
  "result": {
    "key": "snippets/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/c3ecd0c0cda2d22a8bd294675346f603cc2334076c77974f44757669834904ae.txt",
    "size": 10,
    "sha256": "c3ecd0c0cda2d22a8bd294675346f603cc2334076c77974f44757669834904ae",
    "contentBase64": "Rmlyc3QgYm9keQ==",
    "contentUtf8": "First body"
  }
}
```

