# Workflow authoring

`config/workflow.deos.yaml` is executable policy, not a prompt catalog. Changes to graph semantics, prompts, result schemas, provider prerequisites, timeouts, or Linear gate names require review before a new immutable version is enabled.

Each node has one of four types:

- `agent` references a structured job and maps validated result classes to reviewed edges;
- `system_action` references a service allowlist entry and maps completed or failed receipts;
- `human_gate` names the visible Linear state and has explicit approved/rejected edges;
- `terminal` records succeeded, blocked, failed, or canceled.

Edges contain only outcome-to-node mappings. Expressions, executable code, implicit gates, and agent-selected state names are rejected by the loader. A success edge is unavailable until required provider receipts and the immutable artifact manifest are complete.

Jobs declare their prompt file, input names, durable context references, JSON result schema, and required output files. Both bundled schemas use `additionalProperties: false`; adding an output field requires a schema revision. Never add a Linear transition field to an agent schema.

Before enabling a new version:

```sh
npm test
npm run typecheck
npm run types:check
npx openspec validate run-codex-in-cloudflare-sandbox --strict
```

The canonical digest covers the resolved YAML, prompt text, and schemas. Reusing a definition ID/version with different content is rejected by D1. Increment the version for every semantic change and preserve prior rows for active and historical runs.
