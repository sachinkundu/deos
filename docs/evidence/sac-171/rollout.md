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

After #119 merged, release 34705770149 still redirected the reviewer request
after the service-authenticated version request. PR #121 separates those cookie
sessions. Its local cookie regression passes, and the reviewer sidebar flow
passed against staging with the two service-authenticated version calls omitted.
Diagnostic CI run 34706172501 was rejected before execution because staging only
permits main. Both temporary reviewer secrets were removed and their absence
was verified. The full release check and production promotion remain pending.

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
  "ingress_tier_policy": [
    {
      "name": "SANDBOX_TIER_POLICY_VERSION",
      "text": "legacy-basic-v1",
      "type": "plain_text"
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
  "deployment_id": "aaeddf74-de01-401f-b9f7-64bfc7b8fcc7",
  "versions": [
    {
      "version_id": "0ea2577b-3f1f-482c-8dc5-ebbfaa5cebee",
      "percentage": 100
    }
  ]
}
{
  "worker": "deos-workflow-portal-staging",
  "deployment_id": "8d5f493f-df43-4dbc-a4b7-75668e884f92",
  "versions": [
    {
      "version_id": "19736a5b-4942-47c3-805b-aee073133fce",
      "percentage": 100
    }
  ]
}
{
  "pending_dispatches": [
    {
      "pending": 0
    }
  ],
  "rows_written": 0
}
{
  "enabled_projects": [
    {
      "project_id": "2a653831-c1ec-4db7-972a-d0d08ac0a3d8",
      "dispatch_enabled": 1
    },
    {
      "project_id": "99426d9b-cda7-4db4-9136-692a95a0b090",
      "dispatch_enabled": 1
    },
    {
      "project_id": "b0b6265d-5e61-4315-9ef4-724ddb391700",
      "dispatch_enabled": 1
    }
  ],
  "rows_written": 0
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
  "start_deliveries": [],
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
          "active": 0,
          "assigned": 0,
          "healthy": 4,
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

```bash
rtk proxy python3 docs/evidence/sac-171/read-rollout-proof.py /Users/sachin/code/deos/.env
```

```output
{
  "worker": "deos-sample-project",
  "deployment_id": "168574b9-2041-4733-ba43-0b527ff9505d",
  "versions": [
    {
      "version_id": "0d481854-9d0c-4683-81fe-3a8caf45bcf0",
      "percentage": 100
    }
  ]
}
{
  "ingress_tier_policy": [
    {
      "name": "SANDBOX_TIER_POLICY_VERSION",
      "text": "event-label-v1",
      "type": "plain_text"
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
  "deployment_id": "aaeddf74-de01-401f-b9f7-64bfc7b8fcc7",
  "versions": [
    {
      "version_id": "0ea2577b-3f1f-482c-8dc5-ebbfaa5cebee",
      "percentage": 100
    }
  ]
}
{
  "worker": "deos-workflow-portal-staging",
  "deployment_id": "8d5f493f-df43-4dbc-a4b7-75668e884f92",
  "versions": [
    {
      "version_id": "19736a5b-4942-47c3-805b-aee073133fce",
      "percentage": 100
    }
  ]
}
{
  "pending_dispatches": [
    {
      "pending": 0
    }
  ],
  "rows_written": 0
}
{
  "enabled_projects": [
    {
      "project_id": "2a653831-c1ec-4db7-972a-d0d08ac0a3d8",
      "dispatch_enabled": 1
    },
    {
      "project_id": "99426d9b-cda7-4db4-9136-692a95a0b090",
      "dispatch_enabled": 1
    },
    {
      "project_id": "b0b6265d-5e61-4315-9ef4-724ddb391700",
      "dispatch_enabled": 1
    }
  ],
  "rows_written": 0
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
  "start_deliveries": [],
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
          "active": 0,
          "assigned": 0,
          "healthy": 4,
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

```bash
rtk proxy python3 docs/evidence/sac-171/read-rollout-proof.py /Users/sachin/code/deos/.env
```

```output
{
  "worker": "deos-sample-project",
  "deployment_id": "168574b9-2041-4733-ba43-0b527ff9505d",
  "versions": [
    {
      "version_id": "0d481854-9d0c-4683-81fe-3a8caf45bcf0",
      "percentage": 100
    }
  ]
}
{
  "ingress_tier_policy": [
    {
      "name": "SANDBOX_TIER_POLICY_VERSION",
      "text": "event-label-v1",
      "type": "plain_text"
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
  "deployment_id": "aaeddf74-de01-401f-b9f7-64bfc7b8fcc7",
  "versions": [
    {
      "version_id": "0ea2577b-3f1f-482c-8dc5-ebbfaa5cebee",
      "percentage": 100
    }
  ]
}
{
  "worker": "deos-workflow-portal-staging",
  "deployment_id": "8d5f493f-df43-4dbc-a4b7-75668e884f92",
  "versions": [
    {
      "version_id": "19736a5b-4942-47c3-805b-aee073133fce",
      "percentage": 100
    }
  ]
}
{
  "pending_dispatches": [
    {
      "pending": 0
    }
  ],
  "rows_written": 0
}
{
  "enabled_projects": [
    {
      "project_id": "2a653831-c1ec-4db7-972a-d0d08ac0a3d8",
      "dispatch_enabled": 1
    },
    {
      "project_id": "99426d9b-cda7-4db4-9136-692a95a0b090",
      "dispatch_enabled": 1
    },
    {
      "project_id": "b0b6265d-5e61-4315-9ef4-724ddb391700",
      "dispatch_enabled": 1
    }
  ],
  "rows_written": 0
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
  "start_deliveries": [
    {
      "run_id": "workflow:99426d9b-cda7-4db4-9136-692a95a0b090:5f773b25-3023-405c-9c89-9146bbf5fb07:run:2",
      "delivery_id": "08b8e4e8-833c-41ea-a570-f448f001c08e",
      "received_at": "2026-09-13T05:51:15.252999+00:00",
      "start_slow_ok": 1,
      "sandbox_tier_policy_version": "event-label-v1"
    },
    {
      "run_id": "workflow:99426d9b-cda7-4db4-9136-692a95a0b090:353a3f52-740c-443a-811e-e27a6f20dc6f:run:1",
      "delivery_id": "41ac1e60-0839-4150-8df4-deb55298463e",
      "received_at": "2026-09-13T05:51:15.832999+00:00",
      "start_slow_ok": null,
      "sandbox_tier_policy_version": "event-label-v1"
    }
  ],
  "rows_written": 0
}
{
  "rollout_runs": [
    {
      "run_id": "workflow:99426d9b-cda7-4db4-9136-692a95a0b090:5f773b25-3023-405c-9c89-9146bbf5fb07:run:2",
      "issue_id": "5f773b25-3023-405c-9c89-9146bbf5fb07",
      "status": "active",
      "current_node": "planning_author",
      "sandbox_tier": "basic",
      "sandbox_tier_source": "event_slow_ok",
      "sandbox_tier_policy_version": "event-label-v1",
      "attempt_id": "01a09952-3644-71a8-bc4d-efb22fd35f07",
      "attempt_tier": "basic",
      "state": "running",
      "started_at": "2026-09-13T05:51:37.397Z",
      "ended_at": null
    },
    {
      "run_id": "workflow:99426d9b-cda7-4db4-9136-692a95a0b090:353a3f52-740c-443a-811e-e27a6f20dc6f:run:1",
      "issue_id": "353a3f52-740c-443a-811e-e27a6f20dc6f",
      "status": "active",
      "current_node": "planning_author",
      "sandbox_tier": "standard-2",
      "sandbox_tier_source": "event_default_standard2",
      "sandbox_tier_policy_version": "event-label-v1",
      "attempt_id": "01a09952-5bbf-7c90-abe4-07eb1fa72cd5",
      "attempt_tier": "standard-2",
      "state": "running",
      "started_at": "2026-09-13T05:51:46.965Z",
      "ended_at": null
    }
  ],
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
          "assigned": 1,
          "healthy": 3,
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
          "active": 0,
          "assigned": 1,
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
