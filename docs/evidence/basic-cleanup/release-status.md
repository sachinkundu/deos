# Release status

Observed on 13 September 2026. Implementation PR: https://github.com/sachinkundu/deos/pull/125.

The ingress now selects the existing `legacy-basic-v1` policy. Its active version is `1b5e60e7-37d1-4681-a36a-73434542584a` at 100% traffic. This is the supported Basic policy; saved delivery tiers retain their original meaning. The policy was deployed before the backend because GitHub merge writes were failing. See [the provider readback](rollout.md).

Completion-triggered collection is implemented but **not deployed**. The backend still runs version `9ddf9f09-6005-4f6a-b628-563f9c5ccf1f`. An unrelated attempt was active during the latest preflight, so a new backend deployment also needs a fresh activity check.

All six GitHub checks passed for `c2fe568f5564ae6ec3e09b06a76ec9ce00d1899e`. Local validation passed 432 TypeScript tests, 70 Python tests, typechecking, Python lint, generated backend bindings, both Worker dry runs, and strict OpenSpec validation.

Both bot findings are fixed: completion requests share the remaining attempt deadline, and optional diagnostic copies cannot invalidate the primary manifest. GitHub repeatedly rejected merge and review-reply writes through REST, GraphQL, the connector, and the browser. Read APIs and branch pushes worked. The PR remains open; neither review reply has been saved. Leave both threads unresolved when replying.

Pending reply to review comment 3999248250:

> Fixed. Each request now uses the smaller of three seconds and the remaining attempt lifetime, with one second reserved for process exit. The budget is checked again before retrying, and no request starts when it is exhausted. A regression test checks a near-deadline timeout and confirms the retry is skipped.

Pending reply to review comment 3999252498:

> Fixed. Optional status and error logs are copied to separate diagnostic objects after the primary manifest is complete. Copy failures retain their original cause and safely read content through the workflow error writer; they no longer invalidate the work result. Tests cover failed existence checks, reads, writes, and checksum verification.

SAC-179 is prepared in Backlog with no tier label. [Its initial state](linear-before.png) is preparation evidence, not proof of execution. After the backend is active, start the issue through Linear, confirm its recorded Basic tier, and compare the supervisor's diagnostic `completedAt` with the durable terminal timestamp and destroyed cleanup state. Verify the completion wake was received. Keep the heartbeat as the recovery path.

Remaining work: save the two review replies, merge the PR, deploy and verify the backend and both container images, capture real provider cleanup timing, then reconcile and archive OpenSpec. No fixed 20-attempt qualification window is required.
