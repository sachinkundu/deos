## 1. Default Definition and Durable State

- [ ] 1.1 Add the additive delivery-work-product migration with stable branch, pull-request, manifest, merge, verification, foreign-key, uniqueness, and all-or-none constraints; add migration tests.
- [ ] 1.2 Add a durable delivery-work-product store that allocates one run branch, records publication by compare-and-set, and records merge and verification with read-back tests.
- [ ] 1.3 Make the bundled `simple` definition the registered project-policy default while preserving the dispatch value and every frozen historical definition.
- [ ] 1.4 Remove label-selector lookup and override from new-run allocation; record default project-policy selection and prove labels and unavailable label evidence do not change the selected definition.
- [ ] 1.5 Stop registering, reading, or mutating the former selector in runtime settings while leaving legacy rows and version 4 runs intact.

## 2. One Complete Delivery Attempt

- [ ] 2.1 Add immutable simple workflow version 5 with claim, one delivery agent, Human Review revision and approval edges, trusted merge and verification, and explicit terminal outcomes.
- [ ] 2.2 Add the delivery-agent prompt that creates or revises proposal, specs, design, tasks, implementation, tests, and validation in one attempt and forbids deploy, merge, archive, approval, and Linear transitions.
- [ ] 2.3 Update the definition loader, capability allowlist, and definition tests for the new delivery job and system actions while retaining version 4 restoration coverage.
- [ ] 2.4 Materialize one stable delivery branch, exact OpenSpec change identity, current governed head, prior results, and bounded review feedback for the first and revision attempts.
- [ ] 2.5 Render and protect the delivery prompt, mint only the delivery publication capability, and require the exact provider receipt before accepting completion.
- [ ] 2.6 Update the safe portal projection and approved simple presentation mapping so version 4 and version 5 runs both render without inventing or dropping nodes.

## 3. Governed Full-Delivery Pull Request

- [ ] 3.1 Define and test the delivery publication request and manifest validator, including exact identity, required OpenSpec files, completed tasks, implementation files, validation evidence, bounded paths and sizes, and revision replies.
- [ ] 3.2 Extend capability claims and routing with `github.publish_delivery_work_product`; deny wrong run, attempt, repository, branch, change, operation key, or stale head before provider access.
- [ ] 3.3 Generalize the GitHub adapter to create or update one stable delivery pull request, reconcile ambiguous responses, apply the exact revised manifest, and reply to every supplied review thread without resolving it.
- [ ] 3.4 Persist and read back the confirmed publication receipt, pull-request identity, head, full manifest digest, and manifest JSON for each accepted revision.
- [ ] 3.5 Add trusted delivery merge and verification actions that require the recorded pull request and reviewed head, verify the merged manifest at the merge commit, and confirm that commit is on `main`.
- [ ] 3.6 Add deterministic tests for duplicate publication, ambiguous create or update, stale revision, head substitution, partial receipts, merge ambiguity, manifest mismatch, and post-merge read-back.

## 4. Portal Route and Settings Separation

- [ ] 4.1 Remove selector fields, copy, request parsing, and D1 mutations from the settings API and UI; keep repository and dispatch revision guards, active-run lock, and durable read-back.
- [ ] 4.2 Build the approved visualization and the existing settings application as two production entries in one portal artifact directory without one build erasing the other.
- [ ] 4.3 Route `/` to visualization, `/settings` and `/settings/` to settings, declared hashed assets to their files, and unsupported browser paths to a safe not-found response after Access authentication.
- [ ] 4.4 Add deterministic route, authentication, method, generated-asset, and settings contract tests that prove `/settings` cannot fall through to visualization.
- [ ] 4.5 Run the local portal and visually verify the approved root workflow map, the restored settings page without a selector, theme behavior, and safe unsupported-path view.

## 5. Repository Validation and Compatibility

- [ ] 5.1 Run migration tests, workflow and capability tests, portal tests, presentation tests, TypeScript checks, production builds, and strict OpenSpec validation; record exact results.
- [ ] 5.2 Prove version 4 planning-only runs still restore, project, expose transcripts, and complete through their legacy governed work-product path.
- [ ] 5.3 Verify no delivery prompt, manifest, receipt, portal response, log, or artifact exposes credentials, raw provider responses, unrestricted definition content, or private R2 keys.

## 6. Deployment and Real Provider Proof

- [ ] 6.1 Capture the remote definition, policy, schema, Access, Worker version, binding, dispatch, selector, and active-run baselines; keep dispatch disabled and confirm no active run.
- [ ] 6.2 Apply and read back the additive D1 migration, then deploy capability, Workflow, Queue, and two-entry portal changes in compatibility order with dispatch still disabled.
- [ ] 6.3 Read back simple version 5 as the project-policy default, confirm the former selector cannot affect selection, verify the minimum bindings and Access policy, and prove `/`, `/settings`, and an unsupported path show their exact intended results.
- [ ] 6.4 Enable dispatch without applying a workflow label, create one small real Linear issue, start it through the provider, and capture matching ingress, Queue, Workflow, D1, portal, and timing evidence through Human Review.
- [ ] 6.5 Confirm one agent attempt produced proposal, specs, design, tasks, implementation, tests, validation, transcript, and one governed pull request; approve it in Linear, then capture exact-head merge, post-merge verification, and terminal portal proof.
- [ ] 6.6 Disable canary dispatch after the run is terminal and read back the disabled value, with no active or waiting run left behind.
