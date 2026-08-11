## Tasks

- [ ] Create a deterministic Python project skeleton with domain interfaces for ingress, queue, state, and artifact storage, plus tests using fakes only.
- [ ] Implement signature/timestamp validation, event classification, and delivery deduplication behind the ingress interface.
- [ ] Implement normalized-event dispatch and auditable workflow transitions, including an explicit approval state.
- [ ] Add artifact provenance records and deterministic evidence capture for workflow runs.
- [ ] Add adapter boundaries for Cloudflare bindings without enabling live integrations in the test suite.
