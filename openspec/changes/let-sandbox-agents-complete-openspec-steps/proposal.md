## Why

DEOS currently models repository-local OpenSpec work as trusted system actions whose success requires an exact D1 receipt, even though the sandbox agent already performs the repository work and returns a structured outcome. This prevents the governed workflow from advancing through OpenSpec steps that need no external provider effect.

## What Changes

- Let the workflow assign a supported OpenSpec action and change identity to a sandbox agent and record both in the normal run audit history.
- Accept a schema-valid `completed` agent result for repository-local OpenSpec work without requiring a separate OpenSpec `system_action` receipt, then follow only the workflow definition's configured success edge.
- Route schema-valid `blocked` and `failed` results through their configured non-success edges without allowing the agent to choose a node or Linear state.
- Use the next real consumer of an OpenSpec artifact as its first semantic validation: missing or invalid artifacts fail clearly through that consumer's normal workflow path.
- Support `openspec.create_proposal_and_requirements`, `openspec.create_delta_specs`, `openspec.create_tasks`, `openspec.verify`, and `openspec.sync_and_archive` under this repository-local contract.
- Preserve trusted execution and durable receipt requirements for GitHub, Linear, deployments, and every other external provider effect.

### Non-goals

- Adding a separate trusted OpenSpec command adapter or speculative artifact verification layer.
- Allowing an agent result to select the next workflow node or mutate Linear state.
- Relaxing provider receipt, idempotency, or authorization requirements for external effects.
- Expanding the supported repository-local action set beyond the named OpenSpec actions.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `sandbox-agent-execution`: Define how a sandbox attempt receives a repository-local OpenSpec action and change identity, reports `completed`, `blocked`, or `failed`, and leaves artifact validation to the next real consumer.
- `workflow-state`: Allow completed repository-local OpenSpec agent outcomes to take configured success edges without an OpenSpec system-action receipt while preserving explicit non-success routing, workflow authority, audit history, and external-effect receipt requirements.

## Impact

- Affects the versioned workflow definition, job inputs and result contract, evaluator and orchestrator handling, D1 run audit records, and OpenSpec workflow documentation.
- Reclassifies the five supported OpenSpec operations from receipt-gated local system actions to sandbox-agent work whose structured result controls only the current node's configured edge.
- Requires deterministic coverage for completed, blocked, failed, and missing-downstream-artifact behavior plus a deployed provider-originated canary that advances through at least one OpenSpec step.
- Tracked by Linear SAC-106 and supersedes the earlier idea of a separate trusted OpenSpec action adapter after SAC-92.
