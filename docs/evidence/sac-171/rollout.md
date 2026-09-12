# SAC-171 production rollout

*2026-09-12T16:16:59Z by Showboat 0.6.1*
<!-- showboat-id: 52c3ff18-5b9d-4a37-b07b-cfd38e07a7b7 -->

```bash
rtk proxy python3 docs/evidence/sac-171/read-rollout-proof.py /Users/sachin/code/deos/.env
```

```output
{
  "worker": "deos-sample-project",
  "deployment_id": "932c4c75-efa0-493a-a8bb-eba692bdb31f",
  "versions": [
    {
      "version_id": "a120579e-3d72-44d6-b9a9-aa9240357e41",
      "percentage": 100
    }
  ]
}
{
  "worker": "deos-queue-consumer-ts",
  "deployment_id": "bde5432b-d5d8-4dfb-99d6-280f1dad0e09",
  "versions": [
    {
      "version_id": "37009219-2cd2-4f26-afbc-1f9dd0376c6c",
      "percentage": 100
    }
  ]
}
{
  "worker": "deos-workflow-portal",
  "deployment_id": "e1616af3-593f-4608-a54b-ab0eac79850c",
  "versions": [
    {
      "version_id": "b01771d7-464b-4c5d-b6d8-e613f759f201",
      "percentage": 100
    }
  ]
}
{
  "worker": "deos-workflow-portal-staging",
  "deployment_id": "998bf7f5-73fe-4df1-82ce-f2e2b1407dd2",
  "versions": [
    {
      "version_id": "964347b4-73c9-454e-84ed-5fbff13274dc",
      "percentage": 100
    }
  ]
}
{
  "tier_validation": [
    {
      "invalid_runs": 0,
      "invalid_attempts": 0,
      "unversioned_deliveries": 0
    }
  ],
  "rows_written": 0
}
{
  "tier_enforcement": [
    {
      "name": "sandbox_tier_attempt_immutable"
    },
    {
      "name": "sandbox_tier_delivery_immutable"
    },
    {
      "name": "sandbox_tier_no_legacy_update"
    },
    {
      "name": "sandbox_tier_require_attempt"
    },
    {
      "name": "sandbox_tier_require_delivery"
    },
    {
      "name": "sandbox_tier_require_run"
    },
    {
      "name": "sandbox_tier_run_immutable"
    },
    {
      "name": "sandbox_tier_trial_bind"
    },
    {
      "name": "sandbox_tier_trial_immutable"
    }
  ],
  "rows_written": 0
}
{
  "rollout_runs": [],
  "rows_written": 0
}
{
  "queue": {
    "backlog_count": 0,
    "backlog_bytes": 0,
    "oldest_message_timestamp_ms": 0
  }
}
{
  "sandbox_classes": [
    {
      "name": "deos-queue-consumer-ts-standard2sandbox",
      "image": "registry.cloudflare.com/c68856288112af7698f5be52ea94b96e/deos-queue-consumer-ts-sandbox@sha256:a275dfc2c81de9cc167606907ce5724bdbc3ed71dc40e3bf787232381844f875",
      "vcpu": 1,
      "memory_mib": 6144,
      "max_instances": 4,
      "health": {
        "errors": [],
        "instances": {
          "active": 0,
          "assigned": 0,
          "healthy": 4,
          "stopped": 0,
          "failed": 0,
          "scheduling": 0,
          "starting": 0
        }
      }
    },
    {
      "name": "deos-queue-consumer-ts-sandbox",
      "image": "registry.cloudflare.com/c68856288112af7698f5be52ea94b96e/deos-queue-consumer-ts-sandbox@sha256:a275dfc2c81de9cc167606907ce5724bdbc3ed71dc40e3bf787232381844f875",
      "vcpu": 0.25,
      "memory_mib": 1024,
      "max_instances": 4,
      "health": {
        "errors": [],
        "instances": {
          "active": 1,
          "assigned": 0,
          "healthy": 3,
          "stopped": 0,
          "failed": 0,
          "scheduling": 0,
          "starting": 0
        }
      }
    }
  ]
}
```

## Compatibility release

Migration 0035 and its enforcement script were applied through Wrangler. The
read-only validation above found no missing or mismatched tiers. The compatibility
ingress version is `a120579e-3d72-44d6-b9a9-aa9240357e41`; it remains the rollback
release and writes `legacy-basic-v1`. The deployed backend version is
`37009219-2cd2-4f26-afbc-1f9dd0376c6c`, built from integration commit `d9d4a2c`
on `codex/sac-171-backend-rollout`. This combines #112 with the existing SAC-170
recovery code and SAC-161 backend. It preserves the container image
`sha256:a275dfc2c81de9cc167606907ce5724bdbc3ed71dc40e3bf787232381844f875`.

Both Basic and Standard-2 container classes were read back with four slots each.
The provider reports no health errors. Account configuration totals eight vCPUs
and 47,104 MiB at all applications' configured maxima, within the recorded
account limits. See `account-headroom.json`.

The first portal release stopped because its reviewer token was missing. The
second stopped because the check omitted Cloudflare's session-binding cookie.
With user-authorized credentials, a direct staging read returned 302 with the
token alone and 200 with the complete session. PR #119 fixes the check. The
temporary GitHub reviewer token was removed after the failed release.
