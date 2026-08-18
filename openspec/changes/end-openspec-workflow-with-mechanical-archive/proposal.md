## Why

The active OpenSpec delivery graph continues from its final post-review human approval into deployment and release-finalization work that has no bounded contract in this workflow. The final approval should instead be the last authority gate, followed only by deterministic native OpenSpec sync/archive bookkeeping and terminal success.

## What Changes

- Replace the active graph tail with `evidence_verification -> openspec_verify -> final_approval -> sync_and_archive -> done`, while routing a rejected final decision to `blocked`.
- Make final approval terminal in the authority sense: approval may start only the mechanical archive job, with no later judgment-bearing agent, deployment action, release-finalization step, or human gate.
- Supply the archive attempt with the exact `/opsx:archive` instruction, trusted OpenSpec change identity, latest integrity-verified cumulative repository patch, and prior result and artifact-manifest context needed for continuation.
- Preserve immutable definition behavior so existing runs retain their selected graph while newly admitted runs use the revised tail.
- Record the human decision, archive attempt, transition to `done`, and terminal `succeeded` business state in D1, with complete artifacts and confirmed Sandbox cleanup.
- Prove the revised plumbing with one deliberately small provider-originated Linear canary that waits at final approval, resumes the same run after a real human decision, archives its OpenSpec change, reaches terminal success, and invokes no deployment or release-finalization node.

### Non-goals

- Executing or deciding an application deployment, selecting an environment, defining rollback, or performing post-deployment verification inside this workflow.
- Designing the future deployment and release workflow.
- Compounding run-level branches or pull requests.
- Treating the plumbing canary as an assessment of every specialist agent's semantic quality.
- Changing earlier review loops, human gates, or the repeated-edge identity behavior delivered by SAC-111.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `workflow-state`: Make the final post-review approval the last authority gate, permit only mechanical native archive work after approval, and terminate the same run as `succeeded` after archive completion while preserving frozen definitions and durable transition history.
- `sandbox-agent-execution`: Define the terminal archive attempt's trusted inputs, cumulative-patch restoration, native `/opsx:archive` completion, durable artifacts, and mandatory Sandbox cleanup without requiring deployment or release-finalization work.

## Impact

- Affects the versioned workflow definition, graph validation, archive job input materialization, Workflow orchestration, and terminal D1 business-state recording.
- Removes the active `deploy` and `release_finalization` nodes and their unused job configuration from newly selected definitions; already-running definitions remain immutable.
- Requires deterministic graph, archive-input, persistence, and cleanup coverage plus a deployed provider-originated canary with D1 and Cloudflare evidence.
- The operator deployment needed to exercise the new DEOS definition is rollout plumbing, not an application deployment node in the governed workflow.
- Tracked by Linear SAC-112 and depends on the completed SAC-111 repeated-transition identity change.
