# DEOS closeout — 30 September 2026

*2026-09-30T16:13:24Z by Showboat 0.6.1*
<!-- showboat-id: 457a91dc-1354-406a-806b-7c4b453a4507 -->

```bash
rtk proxy python3 /tmp/deos_cf_env_exec.py python3 /tmp/sac253_d1_read.py docs/evidence/sac-253/closeout-readback.sql
```

```output
[
  [
    {
      "state": "free",
      "owner_run_id": null,
      "owner_lease_id": null,
      "last_lease_id": "cab6f898b4378c58dda63ee3fedbe8c598e595bb9d339b3a9932fe2232f1f7a5",
      "fence": 46,
      "revision": 4103,
      "updated_at": "2026-09-30T16:09:08.661Z"
    }
  ],
  [
    {
      "lease_id": "cab6f898b4378c58dda63ee3fedbe8c598e595bb9d339b3a9932fe2232f1f7a5",
      "state": "closed",
      "closed_at": "2026-09-30T16:09:08.661Z"
    }
  ],
  [
    {
      "attempt_id": "df0c12f0-b9a6-4f48-95c3-44e8557a61d6",
      "state": "failed",
      "result_class": "codex_terminated",
      "cleanup_state": "destroyed",
      "manifest_id": "manifest:df0c12f0-b9a6-4f48-95c3-44e8557a61d6:failure-v2",
      "ended_at": "2026-09-30T16:04:41.633Z"
    }
  ],
  [
    {
      "active_attempts": 0
    }
  ],
  [
    {
      "kind": "d1_database",
      "plan_state": "absent",
      "cleanup_state": "absent",
      "absent_at": "2026-09-30T16:08:59.699Z"
    },
    {
      "kind": "r2_bucket",
      "plan_state": "absent",
      "cleanup_state": "absent",
      "absent_at": "2026-09-30T16:09:07.130Z"
    },
    {
      "kind": "review_fixture",
      "plan_state": "absent",
      "cleanup_state": "absent",
      "absent_at": "2026-09-30T16:08:54.378Z"
    },
    {
      "kind": "review_runtime_worker",
      "plan_state": "absent",
      "cleanup_state": "absent",
      "absent_at": "2026-09-30T16:08:36.981Z"
    },
    {
      "kind": "review_runtime_workflow",
      "plan_state": "absent",
      "cleanup_state": "absent",
      "absent_at": "2026-09-30T16:08:28.123Z"
    },
    {
      "kind": "test_worker",
      "plan_state": "absent",
      "cleanup_state": "absent",
      "absent_at": "2026-09-30T16:08:10.304Z"
    },
    {
      "kind": "test_worker",
      "plan_state": "absent",
      "cleanup_state": "absent",
      "absent_at": "2026-09-30T16:08:23.879Z"
    }
  ],
  [
    {
      "remove_state": "done",
      "read_state": "absent",
      "resource_count": 7
    }
  ],
  [
    {
      "abort_kind": "blocked_demo",
      "closed_at": "2026-09-30T16:09:08.661Z",
      "cleanup_sha256": "92762cccdd060907495fcc34ebc3fce54077cf5d431dc95ed65c0be8ff1b48b9",
      "absence_sha256": "58bc3795b484224ad4cc72786bbf64cccf31ffc7501ac703476afa76fb664053",
      "failure_evidence_sha256": "6009d990c98b6664e336dc20ad579ce3514c6b8d3b3e6ad80d687128c7f20f28",
      "receipt_json": "{\"leaseId\":\"cab6f898b4378c58dda63ee3fedbe8c598e595bb9d339b3a9932fe2232f1f7a5\",\"runId\":\"workflow:2a653831-c1ec-4db7-972a-d0d08ac0a3d8:e75aad25-c32f-4c23-8184-b4b38388a631:run:2\",\"closeRevision\":4103,\"cleanupSha256\":\"92762cccdd060907495fcc34ebc3fce54077cf5d431dc95ed65c0be8ff1b48b9\",\"absenceSha256\":\"58bc3795b484224ad4cc72786bbf64cccf31ffc7501ac703476afa76fb664053\",\"kind\":\"blocked_demo\"}"
    }
  ],
  [
    {
      "complete_test_attestations": 0
    }
  ],
  [],
  [
    {
      "state": "absent",
      "browser_sessions": 1
    }
  ],
  [
    {
      "live_app_sessions": 0
    }
  ],
  [
    {
      "live_access_identities": 0
    }
  ]
]
```

```bash
rtk proxy python3 /tmp/deos_cf_env_exec.py python3 /tmp/sac253-v14-current-deployment.py
```

```output
[
  {
    "id": "3f7c8d62-cb41-43bb-adfa-fa3a26be6cb8",
    "source": "wrangler",
    "strategy": "percentage",
    "author_email": "sachin.kundu@pm.me",
    "annotations": {
      "workers/message": "Automatic deployment on upload.",
      "workers/triggered_by": "upload"
    },
    "versions": [
      {
        "version_id": "2a52da43-e1aa-4b2a-a8c8-730288a0b830",
        "percentage": 100
      }
    ],
    "created_on": "2026-09-30T16:04:14.275389Z"
  },
  {
    "id": "75b1528d-6941-403d-81be-249ae39f873b",
    "source": "wrangler",
    "strategy": "percentage",
    "author_email": "sachin.kundu@pm.me",
    "annotations": {
      "workers/message": "Automatic deployment on upload.",
      "workers/triggered_by": "upload"
    },
    "versions": [
      {
        "version_id": "e5766734-8e77-4a9d-9587-baf3f944abe2",
        "percentage": 100
      }
    ],
    "created_on": "2026-09-30T16:02:49.083224Z"
  },
  {
    "id": "ceaad3bf-5800-47d2-9932-2b6da4e9c508",
    "source": "wrangler",
    "strategy": "percentage",
    "author_email": "sachin.kundu@pm.me",
    "annotations": {
      "workers/message": "Automatic deployment on upload.",
      "workers/triggered_by": "upload"
    },
    "versions": [
      {
        "version_id": "c333fff5-c949-472f-8d5e-35a0a2f13d3d",
        "percentage": 100
      }
    ],
    "created_on": "2026-09-30T10:44:56.022612Z"
  }
]
```
