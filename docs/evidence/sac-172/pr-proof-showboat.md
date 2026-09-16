# SAC-172: PR images and presentation

*2026-09-16T10:12:45Z by Showboat 0.6.1*
<!-- showboat-id: bea41062-4d14-4ff3-a9ad-c495ad8034f3 -->

```bash
rtk proxy python3 docs/evidence/sac-172/pr-proof-readback.py --env-file /Users/sachin/code/deos/.env
```

```output
{
  "observedAt": "2026-09-16T10:14:38.426522+00:00",
  "pr": "https://github.com/sachinkundu/deos-sample-project/pull/33",
  "state": "open",
  "merged": false,
  "head": "72c46f9f2a3027600289cb60911e2857a08ee688",
  "proofCommit": "3d14078d7e5793731567be3c925424fed442fd59",
  "proofCommitParents": [],
  "images": 31,
  "template": {
    "proposal31": true,
    "design32": true,
    "showboat": true,
    "protectedProofLinks": false,
    "internalReport": false
  },
  "showboat": {
    "url": "https://github.com/sachinkundu/deos-sample-project/blob/3d14078d7e5793731567be3c925424fed442fd59/showboat.md",
    "bytes": 31766,
    "images": 31
  },
  "durable": [
    [
      {
        "current_node": "implementation_review",
        "current_visit_sequence": 55,
        "status": "awaiting_human",
        "definition_version": 36
      }
    ],
    [
      {
        "visit_sequence": 55,
        "node_id": "implementation_review",
        "state": "open",
        "pr_number": 33,
        "head_sha": "72c46f9f2a3027600289cb60911e2857a08ee688",
        "base_sha": "a1dcf3d18e0d20e483e507079a1e1fbe8b490686"
      }
    ],
    [
      {
        "publication_sequence": 3,
        "status": "accepted",
        "provider_receipt": "{\"number\":33,\"head\":\"72c46f9f2a3027600289cb60911e2857a08ee688\",\"url\":\"https://github.com/sachinkundu/deos-sample-project/pull/33\"}"
      }
    ],
    [
      {
        "project_id": "99426d9b-cda7-4db4-9136-692a95a0b090",
        "definition_version": 37,
        "route_revision": 23,
        "workflow_revision": 16,
        "dispatch_enabled": 1,
        "allowed_linear_user_id": "8efc07d8-0d85-430f-84e7-f51bc6833a0b"
      }
    ]
  ]
}
```
