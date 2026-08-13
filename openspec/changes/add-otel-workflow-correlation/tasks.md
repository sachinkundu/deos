## 1. Recover the approved telemetry scope

- [ ] 1.1 Rebase draft PR #7 onto the approved planning commit, relink it from SAC-72 to SAC-80, and keep `initial-architecture` task 4 unchecked until provider-originated proof passes.
- [ ] 1.2 Remove the Queue-consumer `approve`/`reject` outcome-contract fix from the telemetry diff; if a later full TypeScript gate still requires it, create a separate issue and PR.
- [ ] 1.3 Add a shared event-envelope fixture that fixes field names, scalar types, correlation semantics, allowed outcomes, and redaction rules across Python and TypeScript.

## 2. Instrument the workflow boundaries

- [ ] 2.1 Implement Python ingress events for accepted, ignored, duplicate, rejected, and Queue-publication failure paths using the authenticated source delivery as correlation.
- [ ] 2.2 Implement TypeScript Queue-consumption, workflow-run, durable-transition, replay, and Linear-call events with success emitted only after the observed operation completes.
- [ ] 2.3 Enable Cloudflare observability for both low-volume test Workers with full acceptance-run sampling and document how to query `deos.correlation.id`.

## 3. Prove deterministic behavior

- [ ] 3.1 Add Python and TypeScript tests for cross-runtime schema parity, correlation propagation, duplicate delivery, Queue retry, durable replay, and operation ordering.
- [ ] 3.2 Add redaction and failure tests using credential-shaped sentinels and provider errors, verifying that raw bodies, tokens, authorization headers, and unfiltered responses never appear.
- [ ] 3.3 Run the Python suite, TypeScript suite and complete type checks, Ruff, both Wrangler dry runs, Showboat verification, and strict OpenSpec validation.

## 4. Capture provider-originated evidence

- [ ] 4.1 Deploy the approved telemetry-only commit to the isolated test Workers and record the exact Worker versions and observability configuration.
- [ ] 4.2 Trigger one real Linear issue transition and capture a fresh relevant D1 delivery, Queue consumption, expected transitions, outbound Linear call, and a telemetry query joined by the same correlation identifier.
- [ ] 4.3 Attach sanitized provider configuration/result screenshots and executable evidence to PR #7, mark `initial-architecture` task 4 complete, and request approval before starting SAC-79.

