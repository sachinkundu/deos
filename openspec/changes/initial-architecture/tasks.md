## Tasks

- [ ] Create a Python-first Cloudflare Worker skeleton with domain interfaces for ingress, queue, state, telemetry, and artifact storage, plus deterministic tests using fakes.
- [ ] Implement the Linear webhook ACL, signature/timestamp validation, event classification, and D1 delivery deduplication.
- [ ] Implement the first workflow definition and durable dispatch through Cloudflare Queues and D1, including the Linear approval UX.
- [ ] Add OpenTelemetry-compatible correlation across ingress, queue, transitions, and external calls.
- [ ] Deploy the Worker with Queue, D1, and R2 bindings and verify one end-to-end test Linear transition without live agent execution.
- [ ] Add R2 artifact provenance records and deterministic evidence capture for workflow runs.
