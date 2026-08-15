## Why

The Queue consumer currently treats dispatch as completed workflow work: it records the requirements and approval transitions, then updates Linear directly, without running the agent step that is supposed to produce the reviewable result. The next concrete slice is to make that consumer launch durable orchestration which runs Codex in an isolated Cloudflare Sandbox, preserves the resulting evidence, and advances the issue only after the real work succeeds.

## What Changes

- Change the Queue consumer from a direct Linear updater into a durable dispatcher that creates or resumes one Cloudflare Workflow instance for the accepted issue run.
- Add an isolated agent-step runner that executes Codex CLI non-interactively in Cloudflare Sandbox against a controlled Git repository.
- Support trusted ChatGPT-managed Codex authentication for the runner without using an OpenAI API key, including secure handling of refreshed authentication state.
- Persist the agent's structured result, event stream, patch, validation output, and integrity metadata outside the transient sandbox.
- Add stable, auditable capability interfaces through which the trial agent can initiate narrowly scoped GitHub and Linear changes.
- Preserve D1 as the authoritative business-state and audit store while correlating Queue, Workflow, Sandbox, artifact, GitHub, and Linear activity.
- Move the Linear issue to `Human Approval` only after the agent and required provider operations have succeeded.
- Require provider-originated and visual evidence for the deployed Linear-to-Codex-to-GitHub-and-Linear path.

## Capabilities

### New Capabilities

- `sandbox-agent-execution`: Provision a bounded Cloudflare Sandbox, run Codex CLI with a machine-readable result contract, preserve its durable artifacts, and clean up the transient environment.
- `provider-capability-access`: Let an agent initiate least-privileged, idempotent GitHub and Linear operations through a stable capability boundary that can later move behind a credentialless gateway.

### Modified Capabilities

- `workflow-dispatch`: Replace direct completion of the first workflow path with idempotent creation or resumption of durable orchestration and routing of later Linear events to it.
- `workflow-state`: Enter requirements work and human approval according to actual agent and provider outcomes rather than immediately on Queue consumption.
- `workflow-observability`: Extend the shared correlation contract across Workflow instances, sandbox attempts, Codex execution, durable artifacts, and provider capability calls.

## Non-goals

- Building a general multi-tenant agent platform.
- Delivering the complete production credential gateway in this change.
- Running Codex synchronously inside the Queue consumer.
- Replacing D1 business state with Cloudflare Workflow internal state.
- Treating synthetic ingress, fake provider calls, or deterministic tests as provider end-to-end proof.

## Impact

- Affects the TypeScript Queue consumer, workflow state machine, D1 schema, telemetry contract, and Cloudflare deployment configuration.
- Adds a Cloudflare Workflow runner, Cloudflare Sandbox container, Codex CLI runtime, and concrete R2 artifact production.
- Adds controlled GitHub and Linear trial integrations and new secret-handling requirements.
- Preserves the existing Python webhook ingress and normalized application-event boundary.
- Tracked by Linear parent `SAC-88`; the proposal review gate is `SAC-90`.
