# SAC-172 implementation: SAC-182 canary preparation

The implementation is on `codex/sac-172-implementation`, based on the merged design at `584d676e18baab6032446c75b805fa410f6ec456`. SAC-182 is the selected canary. No SAC-172 implementation PR has been opened. Migrations 0037–0039, the backend, webhook receiver, and staging workflow portal are deployed. The checked design handoff is established and still waits for the user's approval.

The [remote rollout and gate read-back](sac-182-rollout.md) records one version at 100% on each deployed Worker, the expected implementation container image, healthy capacity, frozen test profile, unchanged design PR head, and the new open review visit. The original Workflow instance is terminated; its replacement waits for `linear-event:design_review:visit:23`. The staging portal was verified in the authenticated browser and shows definition v27 at design review. Wrangler's final route-list request failed with Cloudflare code 10000 after portal activation; both the existing live route and its 100% deployment were verified separately.

## What is implemented

The separate `implementation` workflow continues from a verified design merge through native task creation and implementation. Each try has fresh execution and test resources. Checked code, commands, documentation, and proof bind to the same Git tree and base. Trusted services publish one run branch and one PR. Clarification consumes a new comment from the frozen human; final review consumes a state change from that human. A stale base invalidates the old merge choice and rebuilds the saved work. Code merge remains separate from live release.

Cloud jobs enable native live web search. The trusted document reader opens current first-party pages, follows only allowed redirects, and records canonical citations. Model/provider credentials remain outside the author account. Unsupported provider tests remain capability blockers until a checked safe adapter is available.

Terminal color codes and trailing padding have been removed from saved logs.

## Local verification

| Check | Result | Evidence |
| --- | --- | --- |
| Backend tests | 453 passed | [Full output](backend-tests.log) |
| Python tests | 71 passed | [Full output](python-tests.log) |
| Portal tests | 88 passed | [Full output](portal-tests.log) |
| Backend and portal TypeScript checks | Passed | `npm run typecheck`, `npm run portal:typecheck` |
| Python lint on changed files | Passed | `ruff check` |
| Python strict type baseline | 264 pre-existing errors, no new errors | [Comparison](python-types.json) |
| OpenSpec | Strict validation passed | `openspec validate sac-172 --strict` |
| Worker package and container | Dry run and Linux image build passed | [Worker](worker-dry-run.log), [container](container-build.log) |
| Portal production builds | Both entries passed | [Build output](portal-build.log) |
| Packaged runner | Local Worker with private D1/R2, D1 writes across requests, actual Showboat command, native live-search configuration, filesystem denials, and clean process exit passed | [Result](runner.json), [Showboat](showboat.md), [runner output](runner-probe.log), [preview output](preview.log) |
| Portal layout | Local fixture renders at 1280px and 390px; no page errors or horizontal overflow | [Desktop](portal-local-desktop.png), [mobile](portal-local-mobile.png) |

The Git publication test speaks the real receive-pack protocol to a local Git server and rejects a raced branch head. Provider doubles cover lost create/update responses, one-PR identity, and later publication sequences. SQLite tests run all additive migrations and verify exact human gate authority, cross-try resource denial, browser ambiguity, stale merge choices, and immutable artifact read-back. A conflicting cumulative patch retains its full bytes and original failure for the next author.

The packaged-runner probe uses a local proof receiver and a model catalog fixture for native configuration discovery. It makes no model request and uses no provider credentials. The model fixture adapts the laptop catalog to the pinned CLI's required metadata field; it is not proof of the provider's model catalog. The native CLI used its bundled bubblewrap fallback. Neither this probe nor the portal fixture is provider-originated end-to-end evidence.

## SAC-182: first automatic canary

The user selected SAC-182, Continue the workflow from BettaView reviews. Its design is at Human Review in PR #136. The user authorized deployment at that gate so approval can continue through automatic implementation. A guarded handoff preserves the frozen planning/design jobs and pending approval, adds the implementation tail, and freezes the checked human and isolated provider-test profile. It rejects a raced human event or changed design head.

The canary uses a per-try disposable PR and Linear task in the sample project. Trusted operations restrict tests to those exact resources, retain uncertain writes without repeating them, and require the matching signed Linear delivery before accepting provider proof. The author never receives the provider credentials. The adapter alone is not proof of SAC-182's changed behavior; the canary must still exercise that behavior through its preview and collect browser and command evidence.

Additional local checks on September 14 passed: 461 backend tests, 72 Python tests, TypeScript, changed Python lint, and a Linux container probe with a nested provider-adapter command. The probe has a local receiver and makes no provider/model request. Its purpose is to prove that a recorded test command can call the adapter without deadlocking. The handoff tests also cover preserving the pending approval, compare-and-set races, and lost replacement creation responses.

Live preparation exposed a native Workers `fetch` receiver error. Commit `bf4f154` fixes it; 15 focused tests and TypeScript passed, followed by successful live GitHub and Linear profile checks. Cloudflare twice applied a pause while losing its response; read-back and the same prepared handoff recovered without a duplicate transition. An old app-generated event from the initial claim also blocked the first compare-and-set. Commit `601f62f` scopes pending events to the current gate's original creation time; all seven handoff tests and TypeScript passed. The original errors remain in D1/R2 and visible diagnostics. No human approval was consumed or fabricated during these repairs.

The current gate is PR #136 at `ae79e7e0a7658942e26e24be0f7070908864ee1c`, visit 23, implementation v27, digest `ad7fec5d557145b5dc8332c1a514a3ff9f3597fd3feee23f9f8e77e526b22f1c`. The user was told it is ready for their design approval, followed by the existing Linear Merging transition. Automatic continuation from a BettaView review is SAC-182's prospective change, so it is not claimed as deployed yet. The progress monitor is active. Full provider-originated canary proof and its implementation PR remain pending.

The agreed canary must use the real provider workflow through planning/design approval and automatic implementation to its PR. Its evidence must include the deployed version and container digest, fresh resource records, actual native web grounding, browser screenshots of the changed behavior, durable proof read-back, and the final GitHub PR subject. Concurrent tries must not share browser, preview, or test data. Exercise clarification, revision, and base movement deliberately where agreed; preserve human gates.

The existing portal staging configuration shares production D1/R2/backend. It must not stand in for isolated implementation test resources. Apply the additive migration before deploying code that queries it, verify activation, and select the new workflow only for the agreed route/run. Existing frozen definitions are unchanged. Do not publish the SAC-172 implementation PR until the agreed canary and remaining tests pass.
