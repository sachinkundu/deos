## Why

DEOS currently models repository-local OpenSpec work as trusted system actions whose success requires an exact D1 receipt, even though the sandbox agent already performs the repository work and returns a structured outcome. This prevents the governed workflow from advancing through OpenSpec steps that need no external provider effect.

## What Changes

- Let the workflow dispatch a sandbox agent with the native OpenSpec instruction for the current step and the change identity, and record both in the normal run audit history.
- Accept a schema-valid `completed` agent result for repository-local OpenSpec work without requiring a separate OpenSpec `system_action` receipt, then follow only the workflow definition's configured success edge.
- Route schema-valid `blocked` and `failed` results through their configured non-success edges without allowing the agent to choose a node or Linear state.
- Use the next real consumer of an OpenSpec artifact, when the configured graph has one, as its first semantic validation: missing or invalid artifacts fail clearly through that consumer's normal workflow path.
- Use OpenSpec's native progression rather than one trusted adapter per artifact: `/opsx:continue` advances planning artifacts, `/opsx:apply` performs implementation, `/opsx:verify` verifies the completed change, and release finalization runs sync and archive.
- Trust a schema-valid terminal OpenSpec completion unless a real observed failure justifies adding a stronger terminal check.
- Preserve trusted execution and durable receipt requirements for GitHub, Linear, deployments, and every other external provider effect.

### Non-goals

- Adding separate trusted OpenSpec command adapters, duplicating OpenSpec's own progression logic, or adding a speculative artifact verification layer.
- Allowing an agent result to select the next workflow node or mutate Linear state.
- Relaxing provider receipt, idempotency, or authorization requirements for external effects.
- Treating repository-local OpenSpec completion as proof that any associated GitHub, Linear, deployment, or other provider effect occurred.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `sandbox-agent-execution`: Define how a sandbox attempt receives a native OpenSpec instruction and change identity, reports `completed`, `blocked`, or `failed`, and leaves artifact validation to the next real consumer when one exists.
- `workflow-state`: Allow completed repository-local OpenSpec agent outcomes to take configured success edges without an OpenSpec system-action receipt while preserving explicit non-success routing, workflow authority, audit history, and external-effect receipt requirements.

## Impact

- Affects the versioned workflow definition, job inputs and result contract, evaluator and orchestrator handling, D1 run audit records, and OpenSpec workflow documentation.
- Replaces receipt-gated, per-artifact OpenSpec system actions with sandbox-agent jobs driven by OpenSpec's native continue, apply, verify, sync, and archive instructions; the configured workflow graph still owns every edge.
- Requires deterministic coverage for completed, blocked, failed, and missing-downstream-artifact behavior plus a deployed provider-originated canary that advances through at least one OpenSpec step.
- Tracked by Linear SAC-106 and supersedes the earlier idea of a separate trusted OpenSpec action adapter after SAC-92.
