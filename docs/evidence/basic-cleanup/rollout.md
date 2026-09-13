# Basic default and prompt sandbox cleanup — release proof

*2026-09-13T08:48:54Z by Showboat 0.6.1*
<!-- showboat-id: b45578ca-96e8-4b86-86b7-6ed4a9036451 -->

PR #125 reuses the Basic release policy and adds authenticated supervisor completion hints. This document records live provider state and timing. Local tests and Worker dry runs passed; those checks alone are not provider proof.

```bash
rtk proxy python3 /tmp/basic-cleanup-active-policy.py
```

```output
{
  "observed_at": "2026-09-13T09:06:31.130635+00:00",
  "worker": "deos-sample-project",
  "deployment_id": "e5fde9ec-9dfa-483d-a657-a3d2c1c2553e",
  "versions": [
    {
      "version_id": "1b5e60e7-37d1-4681-a36a-73434542584a",
      "percentage": 100
    }
  ],
  "sandbox_tier_policy": "legacy-basic-v1"
}
```
