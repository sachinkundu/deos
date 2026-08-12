# Symphony Understanding for deos

Study date: 2026-08-12

Sources:

- [OpenAI Symphony repository](https://github.com/openai/symphony)
- [Symphony language-agnostic specification](https://github.com/openai/symphony/blob/main/SPEC.md)
- [Symphony Elixir workflow example](https://github.com/openai/symphony/blob/main/elixir/WORKFLOW.md)
- [Symphony Linear client](https://github.com/openai/symphony/blob/main/elixir/lib/symphony_elixir/linear/client.ex)
- [Symphony configuration schema](https://github.com/openai/symphony/blob/main/elixir/lib/symphony_elixir/config/schema.ex)
- [Symphony orchestrator](https://github.com/openai/symphony/blob/main/elixir/lib/symphony_elixir/orchestrator.ex)
- [Symphony agent runner](https://github.com/openai/symphony/blob/main/elixir/lib/symphony_elixir/agent_runner.ex)

## Executive understanding

Symphony is a scheduler and execution supervisor around coding-agent runs. Its core unit is
not a webhook delivery and not an individual API call; it is an issue-scoped run with a stable
workspace, retry history, agent session, tracker reconciliation, and operator-visible status.

The important security boundary is:

```text
tracker credential
        |
        v
central tracker adapter / host-side tool executor
        |
        +--> read and write Linear through provider-native operations
        |
        `--> agent session receives tool results, not the raw credential
                         |
                         `--> isolated per-issue workspace and sandbox
```

The coding agent does not need a copy of `LINEAR_API_KEY`. Symphony resolves the tracker
credential in the host-side adapter, advertises provider-native tools to the agent session,
executes those tools outside the child process, and removes tracker secret environment variables
from the child environment. This is the model deos should use when it adds sandboxed coding
agents.

## What Symphony actually specifies

### Policy is repository-owned

Symphony loads a repository-owned `WORKFLOW.md` containing YAML configuration and a prompt body.
The configuration selects the tracker/project scope, active and terminal states, polling cadence,
workspace root, hooks, concurrency, retry limits, Codex command, approval policy, and sandbox
policy. The prompt body supplies issue-specific instructions.

This separates:

1. policy and prompt, owned by the repository;
2. typed runtime configuration;
3. orchestration and retry state;
4. workspace and agent execution;
5. provider integration and authentication;
6. observability.

### The orchestrator is the sole scheduling authority

The reference runtime polls the tracker, normalizes issues, decides eligibility, claims issues,
limits concurrency, dispatches runs, reconciles active runs, stops runs whose tracker state no
longer qualifies, and schedules retries with bounded exponential backoff.

Its internal claim lifecycle is distinct from Linear's issue states:

```text
Unclaimed -> Claimed -> Running
                    `-> RetryQueued

Running / RetryQueued -> Released
```

This distinction matters. `In Progress`, `Human Review`, and `Done` are provider states; they do
not replace the orchestrator's own run/claim state.

### Workspaces are first-class execution state

Every issue gets a deterministic, collision-resistant workspace key. The workspace is created
under a configured root, validated to remain inside that root, reused across retries, and cleaned
when the issue becomes terminal. Hooks run at workspace creation, before an attempt, after an
attempt, and before removal.

The agent subprocess always starts with the workspace as its working directory. Symphony treats
workspace safety as an invariant, not merely a convenience.

### Agent sessions are supervised, not fire-and-forget

The agent runner creates or resumes a Codex app-server session in the issue workspace. It streams
structured events to the orchestrator, tracks session and token metrics, enforces turn/read/stall
timeouts, and can continue the same thread for additional turns while the issue remains active.
Normal completion does not necessarily mean the issue is finished; the orchestrator re-reads the
tracker state and may schedule a continuation.

### Tracker integration is intentionally narrow

The required tracker kernel is read-oriented:

- fetch candidate issues by active states;
- refresh current state for running issue IDs.

Provider-native tools are an optional extension. Symphony deliberately avoids pretending that all
trackers share a generic CRUD model. A Linear adapter can expose Linear-specific issue updates,
comments, PR links, or other tools while preserving provider semantics.

### Restart recovery is tracker/filesystem-driven

The reference specification does not require a durable orchestration database. Runtime scheduling
state is reconstructed from the tracker and filesystem after restart. Exact in-memory scheduler
state is not restored.

That is a deliberate trade-off for a host-local reference implementation. A distributed Cloudflare
implementation needs stronger durable coordination because Workers are independently scheduled and
agent execution may be remote or long-running.

## Credential model

### What Symphony does

The Linear API key is resolved by the tracker adapter, either from workflow configuration with
environment indirection or from the host's `LINEAR_API_KEY`. The adapter sends it to Linear with
the GraphQL request. The agent child is not given the raw key.

For provider-native agent tools, the adapter contract includes:

- tool specifications and schemas;
- whether each tool mutates tracker state;
- authorization and scope behavior;
- result and error semantics;
- provider idempotency and rate-limit expectations;
- the names of secret environment variables that must be removed from child environments.

### What deos should do

Do not copy `LINEAR_API_KEY` into every Worker, Queue consumer, Sandbox, or future coding agent.
Use one narrow Linear integration boundary, ideally a dedicated `LinearToolGateway` Worker or
service binding. Other components receive only:

- a run ID and issue context;
- an allowlisted tool name and validated arguments;
- a short-lived, non-secret capability reference or signed invocation envelope;
- structured success/failure results.

The gateway alone should hold the Linear secret. It should enforce project/team/issue scope,
actor policy, transition allowlists, idempotency keys, and audit correlation. Agent sandboxes
should be unable to read the gateway secret from environment, filesystem, bindings, logs, or R2.

The current deos Queue consumer's `LINEAR_API_KEY` is therefore a useful temporary adapter, but
not the final distributed architecture. It is scoped to one consumer Worker today; future workers
should call a capability-controlled gateway instead of receiving the same secret.

### Current stopgap policy

For the current build, provide each Worker or sandbox the provider credential it genuinely needs.
Keep that credential in the platform's secret store or runtime injection mechanism, scope it as
narrowly as the provider allows, never commit it, and do not print it in logs or evidence. This is
an intentional stopgap while the capability gateways are not implemented.

For GitHub, prefer a GitHub App installation token for sandbox work. It can be restricted to the
target repository and permissions, and GitHub installation tokens expire after one hour. A sandbox
may receive that short-lived token for direct `git push` or PR operations when necessary; it must
not receive the GitHub App private key or a long-lived broad PAT. GitHub webhook events should
eventually flow back to the control plane so a sandbox does not need a credential just to receive
comments.

## Mapping Symphony onto Cloudflare

| Symphony concept | deos / Cloudflare equivalent |
|---|---|
| `WORKFLOW.md` policy | R2 versioned workflow policy, with a project-policy record and content hash in D1 |
| Polling tracker adapter | Linear webhook ingress plus reconciliation Cron/Worker; webhooks reduce latency, polling repairs missed events |
| Orchestrator authority | Durable Object per project or workflow run, or a Cloudflare Workflow instance for durable steps |
| Claim state | D1 durable run/attempt records, serialized by the DO/Workflow owner |
| Retry queue | Cloudflare Queues with retry/dead-letter policy and durable attempt records |
| Issue workspace | Sandbox/Container or remote isolated workspace keyed by issue identifier and run ID |
| Agent runner | Dedicated agent execution Worker/Sandbox controller, not the ingress Worker |
| Provider-native tools | LinearToolGateway service binding with allowlisted operations |
| Workspace artifacts | R2 objects with run ID, content hash, provenance, and policy version |
| PR/review handoff | Linear/GitHub provider adapters plus durable evidence records |
| Status surface | Structured logs, D1 run queries, OTEL traces, and an operator dashboard later |

The durable Cloudflare flow should look like:

```text
Linear webhook / reconciliation
        |
        v
Ingress Worker: verify, classify, deduplicate, enqueue
        |
        v
Queue
        |
        v
Run coordinator: claim one issue/run and load policy
        |
        +--> LinearToolGateway (only component with Linear credential)
        |
        +--> Agent execution service
        |       |
        |       `--> isolated Sandbox/Container workspace
        |
        +--> D1: run, attempt, transition, lease, audit, correlation
        |
        `--> R2: policy snapshot, OpenSpec artifacts, logs, evidence
```

## Comparison with the current deos repository

### Already aligned

- Raw Linear webhook verification and millisecond timestamp checking.
- `Linear-Delivery`-based ingress deduplication.
- Asynchronous Queue boundary.
- D1 workflow runs and auditable transition rows.
- Explicit `AWAITING_HUMAN_APPROVAL`, `APPROVED`, and `REJECTED` domain states.
- Deterministic issue-scoped run identity and retry-safe transition uniqueness.
- Real provider-originated ingress and Queue-to-D1 evidence.
- OpenSpec as a repository-owned planning/policy layer.

### Important gaps

1. The current ingress is still a Python Worker while the Queue consumer is TypeScript; task 7
   tracks consolidating this boundary.
2. The deployed Queue consumer currently owns the Linear API credential directly. It should later
   become a narrow tool gateway or service-bound adapter.
3. There is no isolated agent execution service, Sandbox/Container workspace, or workspace lease
   model yet.
4. The current D1 workflow record is durable, but per-project/per-run serialization is not yet
   enforced by a Durable Object or Workflow instance.
5. Queue retries exist, but the architecture still needs durable attempt records, explicit
   leases/timeouts, dead-letter handling, and reconciliation.
6. `WORKFLOW.md`-style repository-owned policy is not implemented yet; policy is currently split
   between OpenSpec artifacts and Wrangler variables.
7. OpenTelemetry correlation, R2 provenance, and a useful operator status surface remain open
   work.
8. The current webhook ACL only emits the fields needed for the first slice. A Symphony-like
   normalized issue model needs stable identifier, URL, title, labels, blockers, assignee, and
   dispatchability information for scheduling.

## Recommended architecture decisions

### 1. Separate control plane from execution plane

Ingress, policy, claims, provider tools, audit, and orchestration belong in the control plane.
Agent sandboxes belong in the execution plane. The target execution plane should not need raw
provider credentials; the current stopgap supplies credentials directly only where required.

### 2. Use a capability gateway for provider writes

The first gateway can expose only:

- `linear.issue.move_to_approval`
- `linear.issue.approve`
- `linear.issue.reject`
- `linear.comment.create`
- later, PR/link and review operations

Every call should include run ID, issue ID, project ID, actor/cause, idempotency key, and an
allowlisted transition. The gateway should verify the call against D1 policy before using its
secret.

The corresponding GitHub gateway should expose repository read, branch push, pull-request create,
pull-request comment read/write, and checks read operations as separate capabilities. It should
mint short-lived GitHub App installation tokens for the selected repository and requested
permission subset.

### 3. Make one component authoritative per run

Use a Durable Object keyed by project or issue for serialized transitions, or use Cloudflare
Workflows when the process is naturally a durable multi-step execution. Do not let independent
Queue consumers race to mutate the same run.

### 4. Model attempts separately from runs

One issue may have one logical workflow run and many agent attempts. Store attempt number, worker
lease, workspace key, start/end, failure category, retry time, and evidence references separately.

### 5. Treat webhooks as triggers, not the source of truth

Linear webhooks start fast-path processing. Reconciliation reads current issue state periodically,
repairs missed events, stops ineligible work, and performs startup cleanup. This follows Symphony's
tracker-driven recovery model while keeping Cloudflare's durable state authoritative for workflow
transitions.

### 6. Keep policy versioned and snapshotted

Load the effective project workflow policy once per run, store its content hash/version in D1, and
write the exact policy snapshot to R2. A later policy change must not silently alter an in-flight
run.

## Suggested next OpenSpec slices

These are architectural suggestions, not changes made by this study:

1. `linear-tool-gateway`: centralize Linear credentials and provider-native mutations behind a
   scoped service binding.
2. `run-coordination`: add Durable Object/Workflow serialization, leases, attempt records, retry
   and reconciliation semantics.
3. `workflow-policy`: add repository/R2 `WORKFLOW.md` loading, validation, versioning, and run
   snapshots.
4. `agent-execution`: add isolated Sandbox/Container workspaces and a capability-only tool client.
5. `github-capability-gateway`: mint and mediate short-lived GitHub App installation tokens for
   branch pushes, pull requests, comments, and checks.
6. `evidence-and-observability`: add OTEL correlation, R2 provenance, evidence packs, and an
   operator status surface.

## Bottom line

The key lesson for deos is not “put the Linear token in a shared environment.” It is the opposite:
centralize provider authentication in a control-plane adapter and give each agent only the
minimum capability needed for its current run. Symphony's issue/workspace/run/attempt model is a
strong conceptual base; Cloudflare adds the durable coordination primitives needed to turn that
single-host scheduler into a distributed system.
