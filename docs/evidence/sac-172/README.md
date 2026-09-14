# SAC-172 implementation: ready for canary selection

The implementation is on `codex/sac-172-implementation`, based on the merged design at `584d676e18baab6032446c75b805fa410f6ec456`. No implementation PR has been opened. No staging or production deployment, route activation, existing-run migration, or test issue has been started.

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

## Next: choose and run the first canary

The user asked to pause here to choose the issue. A useful candidate is remembering BettaView's file sidebar width across reloads, with correct clamping on a smaller screen. The current app initializes that width from the viewport on each load. This is a proposed canary, not an issue that has been created or started.

The agreed canary must use the real provider workflow through planning/design approval and automatic implementation to its PR. Its evidence must include the deployed version and container digest, fresh resource records, actual native web grounding, browser screenshots of the changed behavior, durable proof read-back, and the final GitHub PR subject. Concurrent tries must not share browser, preview, or test data. Exercise clarification, revision, and base movement deliberately where agreed; preserve human gates.

The existing portal staging configuration shares production D1/R2/backend. It must not stand in for isolated implementation test resources. Apply the additive migration before deploying code that queries it, verify activation, and select the new workflow only for the agreed route/run. Existing frozen definitions are unchanged. Do not publish the SAC-172 implementation PR until the agreed canary and remaining tests pass.
