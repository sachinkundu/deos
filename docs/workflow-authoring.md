# Workflow authoring

`config/workflow.deos.yaml` is executable policy, not a prompt catalog. Changes to graph semantics, prompts, result schemas, provider prerequisites, timeouts, or Linear gate names require review before a new immutable version is enabled.

Each node has one of four types:

- `agent` references a structured job and maps validated result classes to reviewed edges;
- `system_action` references a service allowlist entry and maps completed or failed receipts;
- `human_gate` names the visible Linear state and has explicit approved/rejected edges;
- `terminal` records succeeded, blocked, failed, or canceled.

Edges contain only outcome-to-node mappings. Expressions, executable code, implicit gates, and agent-selected state names are rejected by the loader. A success edge is unavailable until required provider receipts and the immutable artifact manifest are complete.

Jobs declare their prompt file, input names, durable context references, JSON result schema, and required output files. A repository-local OpenSpec job additionally declares a canonical operation such as `{kind: openspec, instruction: /opsx:continue}`. The loader allowlists these instructions and includes them in the immutable definition digest; prompt prose alone is not an operation identity. Both bundled schemas use `additionalProperties: false`; adding an output field requires a schema revision. Never add a Linear transition field to an agent schema.

OpenSpec continue, apply, verify, and archive are agent jobs. Their schema-valid local completion may advance with no provider receipt after the complete artifact manifest is stored. If such a job attempts any GitHub, Linear, deployment, or other external effect, its declared receipts must exactly match the mechanically captured operations and every operation must be successful or reconciled in D1. Ordinary successful agents and all `system_action` nodes retain their existing non-empty exact-receipt requirement.

Keep semantic reviews aligned with their position in the graph. In particular, pre-release evidence verification may require deterministic implementation evidence and any provider or visual proof applicable to the implemented feature, but it must not require outputs from downstream native verify, release, deployment, finalization, sync, or archive nodes. Service-owned D1/R2 integrity, cleanup, and receipt checks belong in trusted controllers, not in an agent prompt that has no platform credentials.

Every new Sandbox starts from the configured base checkout. The trusted runner then selects the latest complete cumulative `patch.diff` for the run, verifies its R2 bytes against the D1-recorded SHA-256, and applies it before Codex starts. Patch capture uses an isolated temporary Git index with `git add -A` and `git diff --cached --binary HEAD`, so tracked changes, deletions, and new untracked OpenSpec artifacts survive clean-Sandbox continuation without mutating the checkout's real index. The new attempt's immutable job record names that patch, the OpenSpec instruction, and the deterministic lowercased Linear issue identifier used as the change name. Never make a prompt discover continuation state from a previous Sandbox filesystem.

Before enabling a new version:

```sh
npm test
npm run typecheck
npm run types:check
npx openspec validate let-sandbox-agents-complete-openspec-steps --strict
```

The canonical digest covers the resolved YAML, prompt text, and schemas. Reusing a definition ID/version with different content is rejected by D1. Increment the version for every semantic change and preserve prior rows for active and historical runs.
