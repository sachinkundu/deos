## 1. Source and contracts

- [x] 1.1 Import pinned BettaView revision `de22c3cf9a95285647bbf31cac1d6242bef6142a` into `portal/bettaview/` and record provenance.
- [x] 1.2 Add package scripts, Worker configuration, generated binding types, and focused contract fixtures.
- [x] 1.3 Add deterministic tests for canonical pull-request parsing, exact-head behavior, access enforcement, and blocked cloud trace generation.

## 2. DEOS read model

- [x] 2.1 Resolve one governed run from repository and pull-request number through durable work-product records.
- [x] 2.2 Build the ordered all-attempt review story from phases, reviews, candidates, head bindings, workflow visits, provider records, manifests, and cleanup records.
- [x] 2.3 Allowlist and hash-verify every story artifact without failing unrelated safe event metadata.
- [x] 2.4 Expose protected pull-request trace and story routes with contract tests for not-found, unavailable, and mixed-head cases.

## 3. BettaView cloud runtime

- [x] 3.1 Separate GitHub request and review helpers from the local Express process.
- [x] 3.2 Add the Worker entry point, static asset delivery, security headers, and Access JWT validation.
- [x] 3.3 Add GitHub App user authorization, opaque server-side sessions, refresh handling, and capability errors.
- [x] 3.4 Port pull-request reads, native threads, batch comments, replies, review decisions, and Mermaid annotation uploads to the user-token adapter.
- [x] 3.5 Remove cloud model generation, child-process, local-file, and local-token paths while retaining local development support.

## 4. Integrated portal experience

- [x] 4.1 Replace PR, Trace, and Process navigation with focused PR and Review views.
- [x] 4.2 Load DEOS trace and process data by repository and pull-request number and show current, stale, unavailable, and redacted states.
- [x] 4.3 Render author work, self-review, external review, author dispositions, and the final reviewed result in chronological order while excluding operational workflow activity from BettaView.
- [x] 4.4 Add adjacent GitHub and BettaView actions to DEOS workflow node details.

## 5. Verification and delivery

- [x] 5.1 Run BettaView unit, Worker contract, DEOS portal, type, build, and strict OpenSpec checks.
- [x] 5.2 Deploy the DEOS and BettaView Workers, configure the service binding, custom domain, Access application, and GitHub App callback and secrets.
- [x] 5.3 Read back the deployments and verify that SAC-139 resolves without a new Linear delivery or Workflow run.
- [ ] 5.4 Verify the existing SAC-139 planning PR across PR and Review, including D1/R2 hashes, focused review provenance, and stale-head state.
- [ ] 5.5 Verify real GitHub comment, reply, review-decision, and Mermaid annotation actions on an existing controlled pull request under the signed-in human identity.
- [ ] 5.6 Publish a ready implementation PR with tests, deployment proof, provider proof, and completed checkboxes.
