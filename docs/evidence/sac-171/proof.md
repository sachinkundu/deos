# SAC-171 provider contract proof

*2026-09-12T08:30:04Z by Showboat 0.6.1*
<!-- showboat-id: 64187c2c-cfb1-478c-9ebd-bf044749216e -->

```bash
rtk proxy python3 docs/evidence/sac-171/read-provider-proof.py /Users/sachin/code/deos/.env
```

```output
{
  "linear_deliveries": [
    {
      "delivery_id": "944cb38f-a7a4-48ec-9681-d7281e42f5ed",
      "received_at": "2026-09-12T08:02:44.985999+00:00",
      "classification": "relevant",
      "label_selection_evidence_json": "{\"status\":\"available\",\"labels\":[{\"id\":\"6b18934d-9fc1-4c61-b294-c1bc2ea3a8df\",\"name\":\"slow-ok\"}]}"
    },
    {
      "delivery_id": "bbd663a3-afdb-49e4-a83f-a5191ae04a8f",
      "received_at": "2026-09-12T08:04:25.735000+00:00",
      "classification": "relevant",
      "label_selection_evidence_json": "{\"status\":\"available\",\"labels\":[]}"
    }
  ],
  "rows_written": 0
}
{
  "sandbox_classes": [
    {
      "id": "a0360266-c278-481d-85da-c6d5daa277b7",
      "name": "deos-sac171-contract-probe-standard2probe",
      "vcpu": 1,
      "memory_mib": 6144,
      "image": "registry.cloudflare.com/c68856288112af7698f5be52ea94b96e/deos-queue-consumer-ts-sandbox@sha256:46c62f15cc93cefd1dd207ec38b4021aaffac16f7d8d220d266551f48b5c9531"
    },
    {
      "id": "a0332982-3357-442c-9daf-28658bc2af1b",
      "name": "deos-sac171-contract-probe-basicprobe",
      "vcpu": 0.25,
      "memory_mib": 1024,
      "image": "registry.cloudflare.com/c68856288112af7698f5be52ea94b96e/deos-queue-consumer-ts-sandbox@sha256:46c62f15cc93cefd1dd207ec38b4021aaffac16f7d8d220d266551f48b5c9531"
    }
  ]
}
```
