# SAC-167: real Claude review canary

*2026-09-11T09:05:08Z by Showboat 0.6.1*
<!-- showboat-id: 6782d87a-0aa7-49b2-8e15-ad6bec11fbd7 -->

```bash
rtk proxy python3 /tmp/sac167-cloud.py containers info a0344373-884d-4c06-b4c2-4e58295de498 --config wrangler.queue-consumer-ts.jsonc
```

```output
{
    "id": "a0344373-884d-4c06-b4c2-4e58295de498",
    "created_at": "2026-08-16T07:52:21.590000128Z",
    "updated_at": "2026-09-11T09:10:18.187000064Z",
    "account_id": "c68856288112af7698f5be52ea94b96e",
    "name": "deos-queue-consumer-ts-sandbox",
    "version": 53,
    "scheduling_policy": "default",
    "instances": 4,
    "max_instances": 4,
    "configuration": {
        "image": "registry.cloudflare.com/c68856288112af7698f5be52ea94b96e/deos-queue-consumer-ts-sandbox@sha256:8aaf0c6ba822c04ae852e33df55187cbde9568608348735371a371ab6827acfb",
        "vcpu": 0.25,
        "memory": "1GiB",
        "memory_mib": 1024,
        "disk": {
            "size_mb": 4000,
            "size": "4GB"
        },
        "network": {
            "assign_ipv6": "none",
            "assign_ipv4": "none",
            "mode": "private"
        },
        "command": [],
        "entrypoint": [],
        "runtime": "firecracker",
        "observability": {
            "logs": {
                "enabled": true
            }
        }
    },
    "constraints": {
        "tiers": [
            1,
            2
        ]
    },
    "durable_objects": {
        "namespace_id": "3132c2f21e9c48339cb72292268a1589"
    },
    "rollout_active_grace_period": 0,
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
    },
    "network": {
        "bandwidth_limit_mbps": 250
    }
}
```
