## Tasks

- [x] Create a Python-first Cloudflare Worker skeleton with domain interfaces for ingress, queue, state, telemetry, and artifact storage, plus deterministic tests using fakes.
- [x] Implement the Linear webhook ACL, signature/timestamp validation, event classification, and D1 delivery deduplication.
- [x] Implement the first workflow definition and durable dispatch through Cloudflare Queues and D1, including the `Human Approval` Linear board-column UX; use the provider-supported Queue-consumer runtime established by E2E validation.
- [ ] Add OpenTelemetry-compatible correlation across ingress, queue, transitions, and external calls.
- [x] Deploy the ingress Worker and Queue-consumer Worker with Queue, D1, and R2 bindings and verify one provider-originated end-to-end Linear transition without live agent execution.
- [ ] Add R2 artifact provenance records and deterministic evidence capture for workflow runs.
- [ ] Migrate the Python HTTP ingress Worker to TypeScript, update the ingress tests and project tooling accordingly, and require the full test suite, lint/type checks, Wrangler dry runs, and strict OpenSpec validation to pass before completion.
