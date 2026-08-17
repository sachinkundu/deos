# Workflow authoring

`config/workflow.deos.yaml` is executable policy, not a prompt catalog. Changes to graph semantics, prompts, result schemas, provider prerequisites, timeouts, or Linear gate names require review before a new immutable version is enabled.

Version 4 definitions use six explicit node types:

- `agent` references a structured job and maps validated result classes to reviewed edges;
- `system_action` references a service allowlist entry and maps completed or failed receipts;
- `human_gate` names the visible Linear state and has explicit approved/rejected edges;
- `wait` records `awaiting_capability` or `manual_reconciliation_required`, both exact Linear event matchers, and `received`/`canceled` edges;
- `terminal` records only a final `succeeded`, `denied`, or `canceled` outcome and returns normally;
- `failure` records `failed` with a bounded service-authored cause and throws a non-retryable Workflow error.

Every version 4 agent must classify both `blocked` and `failed`; every system action must classify `failed`. A version 4 terminal `blocked`, a wait without a user-authorized cancellation matcher, an event descriptor with extra provider fields, or a free-form failure cause is rejected. Immutable version 3 snapshots retain their legacy terminal `blocked` semantics and are restored by digest without retroactive validation.

Wait descriptors use the internal semantic type `linear.issue.state_changed`. The Cloudflare transport still uses the provider-supported `linear-event` type because Workflow event type names accept only letters, digits, hyphens, and underscores. The event payload contains only the inbox delivery ID; it cannot choose the continuation node or DEOS status.

Edges contain only outcome-to-node mappings. Expressions, executable code, implicit gates, and agent-selected state names are rejected by the loader. A success edge is unavailable until required provider receipts and the immutable artifact manifest are complete.

Jobs declare their prompt file, input names, durable context references, JSON result schema, and required output files. Both bundled schemas use `additionalProperties: false`; adding an output field requires a schema revision. Never add a Linear transition field to an agent schema.

Before enabling a new version:

```sh
npm test
npm run typecheck
npm run types:check
npx openspec validate separate-executor-and-business-lifecycle --strict
```

The canonical digest covers the resolved YAML, prompt text, and schemas. Reusing a definition ID/version with different content is rejected by D1. Increment the version for every semantic change and preserve prior rows for active and historical runs.
