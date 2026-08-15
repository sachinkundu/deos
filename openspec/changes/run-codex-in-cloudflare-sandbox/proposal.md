## Why

The Queue consumer currently treats dispatch as completed workflow work: it records the requirements and approval transitions, then updates Linear directly, without running the agent step that is supposed to produce the reviewable result. The next concrete slice is to make that consumer launch durable orchestration which runs Codex in an isolated Cloudflare Sandbox, preserves the resulting evidence, and advances the issue only after the real work succeeds.

## What Changes

- Change the Queue consumer from a direct Linear updater into a durable dispatcher that creates or resumes one Cloudflare Workflow instance for the accepted issue run.
- Add an isolated agent-step runner that executes Codex CLI non-interactively in Cloudflare Sandbox against a controlled Git repository.
- Support trusted ChatGPT-managed Codex authentication for the runner without using an OpenAI API key, including secure handling of refreshed authentication state.
- Persist the agent's structured result, event stream, patch, validation output, and integrity metadata outside the transient sandbox.
- Add stable, auditable capability interfaces through which the trial agent can initiate narrowly scoped GitHub operations and non-transition Linear operations.
- Require each agent step to return a structured outcome to the Workflow instead of deciding or performing workflow-state transitions itself.
- Preserve D1 as the authoritative business-state and audit store while correlating Queue, Workflow, Sandbox, artifact, GitHub, and Linear activity.
- Make the Workflow state machine the sole authority for Linear transitions and follow-up agent dispatch. It may continue autonomously, launch another agent, record a blocked outcome, or stop at a designated human gate according to the current state and agent result.
- For the controlled first slice, route the successful trial path to `Human Approval` after the agent and required provider operations succeed, without making human approval a requirement after every agent action.
- At states that do require human approval or rejection, accept only events attributable to a verified human actor as the decision that resumes the Workflow.
- Require provider-originated and visual evidence for the deployed Linear-to-Codex-to-GitHub-and-Linear path.

## Capabilities

### New Capabilities

- `sandbox-agent-execution`: Provision a bounded Cloudflare Sandbox, run Codex CLI with a machine-readable result contract, preserve its durable artifacts, and clean up the transient environment.
- `provider-capability-access`: Let an agent initiate least-privileged, idempotent GitHub and non-transition Linear operations through a stable capability boundary that can later move behind a credentialless gateway. Linear state transitions remain Workflow-owned.

### Modified Capabilities

- `workflow-dispatch`: Replace direct completion of the first workflow path with idempotent creation or resumption of durable orchestration and routing of later Linear events to it, with actor identity preserved for gated decisions.
- `workflow-state`: Interpret structured agent outcomes inside the Workflow state machine, keep Linear transitions and follow-up dispatch under Workflow control, and require verified human decisions only at states explicitly defined as human gates.
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
