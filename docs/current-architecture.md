# Current orchestration architecture

The authenticated Python ingress verifies the raw Linear body with HMAC-SHA256, treats `Linear-Timestamp` as milliseconds, deduplicates on `Linear-Delivery`, and enqueues every issue-state change for configured projects. It returns HTTP 200 for accepted, ignored, and duplicate deliveries.

The TypeScript Queue consumer loads an immutable workflow definition and project policy from D1. It allocates a monotonic issue run, derives a stable Cloudflare Workflow ID, records a pending dispatch intent, and reconciles by that ID before acknowledging the Queue. Later events enter a delivery-keyed D1 inbox and use one fixed Workflow event type.

Cloudflare Workflow reloads D1 authority before every graph decision. An active run keeps its immutable definition version: if the deployed bundle advances, the Workflow restores the run's canonical definition from D1 and verifies its digest. Agent, system-action, human-gate, loop, and terminal nodes select only reviewed edges from `config/workflow.deos.yaml`. Agent output cannot name a Linear state or edge. Human approval requires a signed event from `actor.type == user` leaving the active `Human Review` gate; the provider's prior-state ID is authoritative when Linear omits the prior state name.

Every agent node creates a UUIDv7 attempt and a derived Sandbox ID before provider calls. The pinned supervisor runs Codex with argv, fixed staging paths, JSONL output, a JSON result schema, a five-minute heartbeat, and a 24-hour absolute limit. The disposable Sandbox is the `danger-full-access` boundary; it contains no provider credential.

ChatGPT auth is an encrypted, conditionally replaced R2 object protected by an exclusive D1 lease. Required outputs pass schema, size, and credential checks before checksum-verified create-only R2 writes. The Sandbox is destroyed before the manifest is re-read for final integrity verification.

Durable GitHub and Linear work products go through attempt-scoped capability endpoints. Each request is schema-checked, restricted to the trial repository or issue, and recorded under a stable operation identity. A successful agent edge requires a non-empty mechanically captured receipt set that matches the structured result and D1's successful or reconciled operations for the same run and attempt. GitHub uses a short-lived App installation token. Linear capabilities can write notes and artifact references but cannot mutate issue state. Workflow-owned transitions use the Linear app actor and are confirmed only by ordered signed-delivery evidence. A system-action node similarly requires a successful or reconciled receipt for its exact named action; generic manifests cannot make a placeholder action advance.

Cleanup has two views: a Worker cron reconciles D1-known attempts without waking a missing process, and a repository schedule compares Cloudflare provider inventory to D1. D1 attempts in `pending`, `starting`, `running`, or `collecting` are excluded from orphan reports. Associated and standalone orphans produce stable Linear cleanup issues through the trusted Worker.

The implemented slice includes real provider adapters and production bindings. Completion still requires deployed Sandbox, provider-originated Linear, R2, GitHub/Linear work-product, cleanup, and visual evidence for the selected canary.
