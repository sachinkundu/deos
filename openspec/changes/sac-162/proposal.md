## Why

DEOS can retry provider calls, checkout, and failed stages, but those paths do not
share one policy. A brief fault can still stop an agent turn or discard the work
needed to resume it. Every agent turn needs the same recovery contract.

## What Changes

- Route every agent turn through one durable recovery policy. Cover all roles,
  providers, nested agents, and future agent nodes without a list of node names.
- Reuse the current provider backoff, stage retry, operation receipts, and saved
  artifacts. Give nested retry paths one shared budget and deadline.
- Save the exact error before each retry. Retry brief faults with backoff. Stop
  on permanent errors, exhausted limits, cancellation, or missing human approval.
- Reconcile partial work before replay. Resume a live process or saved result
  when possible. Start a fresh attempt only when that is needed and safe.
- Apply the policy to new runs and adopt it for eligible existing runs through
  a recorded transition. Keep their frozen workflow, completed work, and gates.
- Recover quietly. Show retry history and the real final cause when work cannot
  continue. A review concern or failed check remains a result to address.

## Capabilities

### New Capabilities

- `agent-turn-recovery`: One durable recovery contract for all agent turns,
  including error capture, retry limits, replay safety, and recovery proof.

### Modified Capabilities

- `sandbox-agent-execution`: Distinguish a provider retry within a live attempt
  from a fresh execution attempt restored from saved work.
- `workflow-state`: Adopt recovery for existing runs and keep retry ownership,
  history, and business state in agreement.

## Impact

Reuse and extend these paths rather than add a second workflow engine:

- `src/workflow-orchestrator.ts` and `src/workflow-services.ts`: shared dispatch
  of agent nodes and observation of durable results.
- `src/sandbox-controller.ts`, `container/supervisor.mjs`, and nested review
  runners: startup, liveness, execution, collection, and cleanup.
- `src/openrouter-review.ts`, `src/claude-runner.ts`, and provider adapters:
  classify errors and use the shared retry budget.
- `src/stage-retry.ts`, `src/workflow-runtime-recovery.ts`, D1, and R2: reuse
  attempt identity, recorded transitions, operation receipts, and saved work.
- PR #109: retain its full Claude error capture in the final implementation.

Use Python for support scripts where practical. Extend the current Worker and
Node runner paths where their runtime requires TypeScript or JavaScript.

## Non-goals

This change does not approve reviews, rewrite business graphs, replace models,
enable paid usage, or grant access that a provider denied. It does not retry a
valid review result to seek a more favorable result. Portal release separation
remains separate work.

## Sources

- [SAC-162](https://linear.app/sachinkundu/issue/SAC-162/recover-running-workflows-after-backend-updates)
- [Cloudflare step retries](https://developers.cloudflare.com/workflows/build/sleeping-and-retrying/)
- [Cloudflare container rollouts](https://developers.cloudflare.com/containers/configuration/rollouts/)
- [Claude error responses](https://platform.claude.com/docs/en/api/errors)

Provider API error docs guide classification. The design must also verify the
installed Claude CLI and Codex contracts used by the subscription routes.
