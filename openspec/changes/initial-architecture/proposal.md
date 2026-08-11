## Why

deos needs a small, explicit architecture before implementation begins. The first slice should turn a relevant Linear issue state change into a durable, auditable workflow action while preserving human approval points. This establishes the foundation for later requirements, architecture, implementation, evidence, release, and compounding stages.

## What Changes

- Define a public Linear webhook entry point on Cloudflare Workers.
- Authenticate, timestamp-check, classify, and deduplicate incoming Linear events.
- Enqueue relevant events for asynchronous processing.
- Define a dispatcher and workflow state model for selecting the next action.
- Persist project configuration, delivery IDs, workflow runs, transitions, and audit history.
- Define where OpenSpec artifacts and evidence packs are stored.
- Establish a Python-first implementation boundary on a deployed Cloudflare Worker, using Python Workers where the required bindings and dependencies are sufficiently supported.
- Keep human approval as an explicit workflow state that automation cannot silently bypass.
- Exclude live agent execution from the first slice; exercise the real Linear webhook and Cloudflare Worker path with a test project and safe downstream fakes.

## Capabilities

### New Capabilities

- `linear-event-ingress`: Receive, authenticate, classify, acknowledge, and deduplicate Linear webhook events.
- `workflow-dispatch`: Convert accepted Linear events into durable workflow transitions and asynchronous jobs.
- `workflow-state`: Track project workflow state, human approvals, runs, and audit history.

### Modified Capabilities

None.

## Impact

- New OpenSpec specifications under `openspec/specs/`.
- Cloudflare Worker and binding configuration for Queues, D1, R2, and potentially Workflows or Durable Objects.
- Python project tooling managed with `uv`, `pyproject.toml`, Ruff, Pyright, and Pytest.
- Linear webhook and GraphQL API integration.
- Deterministic tests using fake webhook payloads, clocks, queues, and downstream clients, plus one deployed Cloudflare smoke path.
- Future agent runners and VCS integrations, which remain behind explicit interfaces in this first architecture.
