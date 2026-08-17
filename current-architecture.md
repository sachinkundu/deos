# Current Architecture

This is the living, repository-level architecture index. The detailed as-built runtime description is [`docs/current-architecture.md`](docs/current-architecture.md); the normative behavior remains in `openspec/specs/`.

DEOS receives authenticated Linear webhooks in a Python Worker, deduplicates them by `Linear-Delivery`, records them in D1, and hands relevant events to a TypeScript Queue consumer. The consumer owns the immutable versioned graph, stable issue/run/Workflow identities, D1 transitions and inbox, Cloudflare Workflow execution, isolated Sandbox attempts, provider capability receipts, artifact manifests, and cleanup reconciliation.

D1 is the business-state and audit authority. Cloudflare Workflow status is executor evidence. Version 4 graph nodes make the distinction explicit:

- final `succeeded`, `denied`, and `canceled` nodes commit D1 before normal return;
- `awaiting_capability` and `manual_reconciliation_required` waits persist exact resume and cancellation matchers and hibernate the same Workflow instance;
- failure nodes commit D1 `failed` with a bounded service-authored cause before surfacing a non-retryable Cloudflare error;
- legacy version 3 `blocked` runs remain immutable and readable but cannot be authored as version 4 outcomes.

Later signed Linear deliveries for active or waiting runs are stored in the D1 inbox and sent to the recorded Workflow instance. The frozen definition—not the event payload—decides whether the delivery resumes, cancels, or is rejected. Delivery and wait-consumption guards prevent duplicate transitions and provider effects.

A scheduled reconciler compares non-final D1 runs with Cloudflare instance status. Cloudflare `complete` without a final D1 outcome becomes `premature_workflow_completion`: a guarded update marks DEOS failed and creates or reuses one marked comment on the correlated Linear ticket. A lost D1 race is audited without overwriting the newer state or publishing a stale notice.

Both Workers emit bounded correlated observations to Workers Logs. R2 stores protected credentials, immutable artifacts, and diagnostics; trusted provider adapters retain Linear/GitHub credentials outside the Sandbox. Real completion evidence is layered: deterministic tests, deployed Cloudflare status and D1 records, provider-originated Linear transitions, and sanitized visual proof.

Future operator UI, independent executor/business status projection, and native Cloudflare graph work remain separately tracked; they do not replace D1 authority.
