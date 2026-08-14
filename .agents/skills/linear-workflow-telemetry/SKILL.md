---
name: linear-workflow-telemetry
description: Resolve a Linear issue through Linear MCP and list its correlated deos workflow events from Cloudflare Workers Observability. Use when an operator asks to inspect, trace, debug, or explain the telemetry for a Linear issue such as SAC-87, including ingress, Queue, workflow-transition, retry, duplicate, and Linear-update outcomes.
---

# Linear Workflow Telemetry

Reconstruct one Linear-driven workflow across the Python ingress Worker and
TypeScript Queue consumer. Use Linear MCP for issue context and the bundled
read-only helper for Cloudflare telemetry.

## Resolve the Linear issue

1. Call Linear MCP `get_issue` with the supplied issue key.
2. Record the returned issue key, `projectId`, and `stateHistory`.
3. Select the `startedAt` timestamp for the state that admitted the workflow.
   The configured admission state is `In Progress` unless repository config
   proves otherwise.
4. Explain and stop if the issue has no project ID or no admission transition.
   Do not infer an ID or timestamp.

The current Linear MCP response exposes the human issue key rather than the
internal issue UUID stored in telemetry. Resolve the correlation using the
project UUID plus the exact admission timestamp. If a future tool exposes the
internal issue UUID, prefer the exact `--issue-id` mode.

## Query telemetry locally

Run from the repository root. Keep credentials in the ignored `.env`; never
print, copy, or pass credential values on the command line.

```bash
python3 .agents/skills/linear-workflow-telemetry/scripts/query_workflow_telemetry.py \
  --issue-key SAC-87 \
  --project-id 99426d9b-cda7-4db4-9136-692a95a0b090 \
  --event-time 2026-08-14T05:18:47.208Z
```

The helper reads `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` from the
process environment first, then from `.env`. It sends only read-only Workers
Observability queries. Use `--env-file PATH` only when the repository credential
file lives elsewhere.

When an internal issue UUID is known, use the exact lookup:

```bash
python3 .agents/skills/linear-workflow-telemetry/scripts/query_workflow_telemetry.py \
  --issue-key SAC-87 \
  --issue-id 0b1681ec-c651-4572-a0c7-bd95f2a6d09c
```

Use `--json` only when structured output is needed. The JSON is restricted to
the approved workflow observation fields and never includes raw Cloudflare
events or request headers.

## Interpret and report

Present the correlation ID followed by the time-ordered event table. Summarize:

- the final observed stage and outcome;
- every failed event and its bounded `error.type`;
- duplicate delivery outcomes;
- Queue message IDs and attempt numbers when retries exist;
- workflow transitions as `previous_state -> next_state`.

Keep these boundaries explicit:

- Workers Logs is the operational narrative; D1 remains the durable workflow
  state when retained logs are unavailable.
- An incomplete `started` event means no terminal observation was retained for
  that stage; do not call it success.
- Multiple correlations in the discovery window are ambiguous. Do not select
  one automatically; report the candidates and request an exact internal issue
  UUID or a narrower verified transition timestamp.
- Do not expose raw event payloads, webhook bodies, dependency responses,
  authorization headers, tokens, or unrelated account telemetry.

## Failure handling

- Missing credentials: name the missing environment variable; never show
  credential contents.
- No retained events: report the searched UTC window and recommend the durable
  D1 state/history path without claiming that telemetry never existed.
- Cloudflare authorization failure: report only the HTTP status and sanitized
  API error message.
- Linear MCP unavailable: stop instead of bypassing it with browser scraping.

