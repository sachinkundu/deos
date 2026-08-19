# Workflow authoring

`config/workflow.deos.yaml` is executable policy, not a prompt catalog. Changes to graph semantics, prompts, result schemas, provider prerequisites, timeouts, or Linear gate names require review before a new immutable version is enabled.

The lifecycle contract first deployed in definition version 4 and the reconciled active version 11 use six explicit node types:

- `agent` references a structured job and maps validated result classes to reviewed edges;
- `system_action` references a service allowlist entry and maps completed or failed receipts;
- `human_gate` names the visible Linear state and has explicit approved/rejected edges;
- `wait` records `awaiting_capability` or `manual_reconciliation_required`, both exact Linear event matchers, and `received`/`canceled` edges;
- `terminal` records only a final `succeeded`, `denied`, or `canceled` outcome and returns normally;
- `failure` records `failed` with a bounded service-authored cause and throws a non-retryable Workflow error.

Every explicit-lifecycle agent must classify both `blocked` and `failed`; every system action must classify `failed`. An explicit-lifecycle terminal `blocked`, a wait without a user-authorized cancellation matcher, an event descriptor with extra provider fields, or a free-form failure cause is rejected. Immutable version 3 snapshots and parallel-mainline versions 4–10 may retain their legacy terminal `blocked` semantics; restoration distinguishes the frozen node shape and verifies its digest. New definitions at version 11 or later must use the explicit lifecycle terminal contract.

Wait descriptors use the internal semantic type `linear.issue.state_changed`. The Cloudflare transport still uses the provider-supported `linear-event` type because Workflow event type names accept only letters, digits, hyphens, and underscores. The event payload contains only the inbox delivery ID; it cannot choose the continuation node or DEOS status.

Edges contain only outcome-to-node mappings. Expressions, executable code, implicit gates, and agent-selected state names are rejected by the loader. A success edge is unavailable until required provider receipts and the immutable artifact manifest are complete.

Jobs declare their prompt file, input names, durable context references, JSON result schema, and required output files. A repository-local OpenSpec job additionally declares a canonical operation such as `{kind: openspec, instruction: /opsx:continue}`. The loader allowlists these instructions and includes them in the immutable definition digest; prompt prose alone is not an operation identity. Both bundled schemas use `additionalProperties: false`; adding an output field requires a schema revision. Never add a Linear transition field to an agent schema.

OpenSpec continue, apply, verify, and archive are agent jobs. Their schema-valid local completion may advance with no provider receipt after the complete artifact manifest is stored. If such a job attempts any GitHub, Linear, deployment, or other external effect, its declared receipts must exactly match the mechanically captured operations and every operation must be successful or reconciled in D1. Ordinary successful agents and all `system_action` nodes retain their existing non-empty exact-receipt requirement.

Keep semantic reviews aligned with their position in the graph. In particular, pre-final-approval evidence verification may require deterministic implementation evidence and any provider or visual proof applicable to the implemented feature, but it must not require outputs from downstream native verify, final approval, sync, or archive nodes. Service-owned D1/R2 integrity, cleanup, and receipt checks belong in trusted controllers, not in an agent prompt that has no platform credentials.

The active version 11 terminal tail is `evidence_verification -> openspec_verify -> final_approval -> sync_and_archive -> done`. Treat `final_approval` as the last authority-bearing node. Its approved edge may lead only to the mechanical `/opsx:archive` agent; rejection reaches final `denied`, and blocked or failed archive outcomes reach typed failure nodes. Do not add a later reviewer, deployment action, release-finalization action, or human gate.

Every new Sandbox starts from the configured base checkout. The trusted runner then selects the latest complete cumulative `patch.diff` for the run, verifies its R2 bytes against the D1-recorded SHA-256, and applies it before Codex starts. Patch capture uses an isolated temporary Git index with `git add -A` and `git diff --cached --binary HEAD`, so tracked changes, deletions, and new untracked OpenSpec artifacts survive clean-Sandbox continuation without mutating the checkout's real index. The new attempt's immutable job record names that patch, the OpenSpec instruction, and the deterministic lowercased Linear issue identifier used as the change name. `/opsx:archive` additionally requires a non-null completed cumulative patch reference and fails before allocation when none exists. Never make a prompt discover continuation state from a previous Sandbox filesystem.

Before enabling a new version:

```sh
npm test
npm run typecheck
npm run types:check
npx openspec validate end-openspec-workflow-with-mechanical-archive --strict
npx openspec validate separate-executor-and-business-lifecycle --strict
```

The canonical digest covers the resolved YAML, prompt text, and schemas. Reusing a definition ID/version with different content is rejected by D1. Increment the version for every semantic change and preserve prior rows for active and historical runs.
