---
name: cloudflare-container-load
description: Measure the historical peak Cloudflare container load for DEOS, compare it with the configured maximum, and check durable failures for evidence of container-capacity exhaustion. Use when an operator asks how many containers were needed, whether max_instances was reached, or whether work queued or failed because capacity was too low.
---

# Cloudflare Container Load

Run the bundled read-only audit from the repository root:

```bash
python3 .agents/skills/cloudflare-container-load/scripts/query_container_load.py
```

Use `--json` when another tool needs structured output. Add
`--check-workflow-errors` for the strongest historical failure check; this
reads the error summaries for startup-failed Workflow instances and never
prints step output.

The helper reads the Wrangler config and remote D1 database, resolves the live
container application, and queries Cloudflare's container analytics. It uses
`CLOUDFLARE_API_TOKEN` or `CLOUDFLARE_TOKEN` from the environment or ignored
`.env` first. If neither is present, it can reuse the local Wrangler OAuth
credential. It never prints credentials.

## Interpret the result

Keep the evidence boundaries explicit:

- `D1 allocated peak` is the exact overlap of DEOS attempt lifetimes. It is the
  best measure of how many attempts DEOS asked containers to support at once.
- `D1 running peak` counts only attempts with a recorded process start.
- `Cloudflare minute peak` counts distinct container instances observed in each
  retained one-minute analytics bucket. It is provider evidence, but its time
  resolution is coarser than D1.
- `capacity failure matches` finds explicit capacity or instance-limit language
  in durable attempt details and, when requested, Workflow error summaries.
- `largest start delay` is a useful symptom, not proof of a capacity queue.

Do not claim that no capacity wait ever occurred merely because no match was
found. DEOS does not currently store a dedicated `waiting_for_container_capacity`
event. State the checked time range, Workflow coverage, and any unavailable data
source. A historical peak above a proposed new maximum means that the new limit
would constrain a burst that has happened before.

## Safety

This audit is read-only. Do not deploy, edit `max_instances`, retry work, or
change workflow state unless the user separately authorizes that action. Never
show raw Workflow step output, job specifications, prompts, headers, or tokens.
