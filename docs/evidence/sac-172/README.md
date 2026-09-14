# SAC-172 implementation: SAC-182 canary

The implementation is on `codex/sac-172-implementation`, based on the merged design at `584d676e18baab6032446c75b805fa410f6ec456`. SAC-182 is the selected canary. No SAC-172 implementation PR has been opened. Migrations 0037–0040, the backend, webhook receiver, and staging workflow portal are deployed. The user's approval and Merging transition were consumed; the design merged, task generation passed, and the canary started automatic implementation. End-to-end implementation proof is still pending.

The [initial remote rollout and gate read-back](sac-182-rollout.md) records one version at 100% on each deployed Worker, the expected implementation container image, healthy capacity, frozen test profile, unchanged design PR head, and the new open review visit. At that time, the original Workflow instance was terminated and its replacement waited for `linear-event:design_review:visit:23`. The authenticated staging portal showed definition v27 at design review. Wrangler's final route-list request failed with Cloudflare code 10000 after portal activation; both the existing live route and its 100% deployment were verified separately. Later canary progress is recorded below.

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

The user selected SAC-182, Continue the workflow from BettaView reviews. Design PR #136 merged on September 14 at 12:48:14Z after the user's Merging transition. The approved design and initial tested base are `f2b994131d879967940e69ced07932dfffb8bc9a`. The user authorized deployment at the design review gate so approval could continue through automatic implementation. A guarded handoff preserved the frozen planning/design jobs and pending approval, added the implementation tail, and froze the checked human and isolated provider-test profile. It rejects a raced human event or changed design head.

The canary uses a per-try disposable PR and Linear task in the sample project. Trusted operations restrict tests to those exact resources, retain uncertain writes without repeating them, and require the matching signed Linear delivery before accepting provider proof. The author never receives the provider credentials. The adapter alone is not proof of SAC-182's changed behavior; the canary must still exercise that behavior through its preview and collect browser and command evidence.

Additional local checks on September 14 passed: 461 backend tests, 72 Python tests, TypeScript, changed Python lint, and a Linux container probe with a nested provider-adapter command. The probe has a local receiver and makes no provider/model request. Its purpose is to prove that a recorded test command can call the adapter without deadlocking. The handoff tests also cover preserving the pending approval, compare-and-set races, and lost replacement creation responses.

Live preparation exposed a native Workers `fetch` receiver error. Commit `bf4f154` fixes it; 15 focused tests and TypeScript passed, followed by successful live GitHub and Linear profile checks. Cloudflare twice applied a pause while losing its response; read-back and the same prepared handoff recovered without a duplicate transition. An old app-generated event from the initial claim also blocked the first compare-and-set. Commit `601f62f` scopes pending events to the current gate's original creation time; all seven handoff tests and TypeScript passed. The original errors remain in D1/R2 and visible diagnostics. No human approval was consumed or fabricated during these repairs.

The frozen run remains implementation v27, digest `ad7fec5d557145b5dc8332c1a514a3ff9f3597fd3feee23f9f8e77e526b22f1c`. Automatic continuation from a BettaView review is SAC-182's prospective change, so it is not claimed as deployed yet. The progress monitor is active. Full provider-originated canary proof and its implementation PR remain pending.

### Startup failures and recovery

The first implementation attempt exposed a sandbox name one character over the SDK's limit. Commit `c5ad6fd` preserves the full identity digest within the limit and maps the previously saved name for cleanup. Collection then exposed the missing `ContainerProxy` export. Commit `e625563` exports it, installs the approved model/package/broker hosts after the trusted outbound handler, and extends the existing audited retry to implementation tasks and builds. Migration 0040 preserves prior retry records. All 469 backend tests and TypeScript passed.

The failed Workflow was restarted from `agent:implementation_tasks:visit:26` only. Earlier successful steps retained their cached results. Attempt `01a09ff6-1fcd-75f5-8b40-158b5bd52a4b` then finished as interrupted with `missing_process_identity`; its sandbox was destroyed. A guarded retry reached visit 28 and exposed that static class fields shadow the Container SDK's registration setters. Commit `95fd71f` registers handlers through those setters separately for both implementation tiers. A test using the real SDK and local Workerd confirms both the active handler and default deny handler are registered. Those three focused network tests and TypeScript passed. This is runtime contract testing, not provider E2E evidence.

The second failed attempt `01a0a004-82c7-7b33-9855-f6cbc157c4f5` is preserved with cleanup destroyed. The next audited retry retains the same frozen design, human, and policy at visit 30. Its Workflow instance is `wf-v1-pnqzh2yjy2eaqo7dgld5db2vublhfuatzyqyhnlxfwtor2nh75rq`. Backend version `15a714ba-fa85-4852-b13f-6bb7315fa4ee` was read back at 100% traffic. Worker-only deployments used `--containers-rollout none`. Original startup errors and cleanup errors remain in D1/R2; the missing credential lease on these attempts reflects failure before credential acquisition.

At 13:12:10Z, D1 confirmed attempt `01a0a007-0f83-7e22-a761-04f5ec9ef9cd` is running, with a real process identity and a fresh sandbox heartbeat at 13:11:49Z. Its first implementation try is also running. [Showboat records the deployment, gates, and retry history](sac-182-implementation-start.md). The [authenticated live portal screenshot](sac-182-implementation-running.png) shows implementation tasks on v27. These observations establish startup and ongoing process health; task output, model grounding, build/test proof, and the canary PR are still pending.

### Task output and citation repair

The first real task agent completed its process with 57 unchecked tasks and successful OpenSpec checks. D1 records six actual first-party document reads through the deployed broker: Cloudflare service bindings, GitHub reviews and comments, and Linear GraphQL, OAuth actors, and webhooks. The native transcript contains 42 completed shell commands; native web search was available but was not used in this attempt.

Collection failed at 13:23:24Z because the author wrote `claimLocator`, while the implementation collector expected separate `claim` and `artifactLocator` fields. The original `TypeError` is retained in D1/R2, and the sandbox is destroyed. The task output is unaccepted. The [agent result](sac-182-task-output.json), [validation output](sac-182-task-validation.txt), and [original source sidecar](sac-182-task-sources.json) were downloaded from R2 and hash-verified against the completed artifact manifest.

Commit `40b043c` makes the sidecar contract explicit, rejects malformed source records with a useful validation error, and restores the latest failed patch from its verified artifacts into a fresh attempt. Recovery requires matching run, attempt, stage, approved design and base, complete artifacts, finished cleanup, valid paths and matching hashes. It does not accept the failed candidate or rewrite the old attempt. The new author must repair citations, reopen relied-on documents and rerun checks. All 474 backend tests and TypeScript passed.

Backend version `7875d0cc-f5fc-4a63-91b8-5f8cb9ccce20` is deployed at 100%. The guarded retry is established at visit 32 in Workflow `wf-v1-e5gu5tea6xkrn6x7c6ji3nw6zg6itg5llahafblrli7gvf6upmza`. D1 verified that new attempt `01a0a020-1873-7c07-a1d7-1c784cce073d` received the recovered patch `ba672fcd7068c4db12c6bf15879dcc92ed4272fba20ed4c34824571711d259b4` and the failed attempt's diagnostic. The canary's build, full behavior proof and implementation PR remain pending.

The [task-recovery Showboat read-back](sac-182-task-recovery.md) confirms the active deployment, container rollout, retry history and running process `5b2ff642-b0e7-4c19-a33f-cefc8bb21139`. The retry reopened all six documentation pages by 13:40:19Z. The prior attempt was terminal and destroyed in `agent_attempts`, but its `implementation_tries` summary incorrectly remained running.

Commit `a121bde` reconciles failed try summaries from authoritative agent attempts before and after agent execution. It preserves the immutable attempts, saved errors, live tries, other runs and explicit provider uncertainty states. All 475 backend tests and TypeScript pass. Worker version `61bebb9d-a8a8-48f4-a54e-da9859ca833d` was verified at 100% after a Worker-only deployment. The next live reconciliation at 13:44:33Z corrected the prior try to failed while the current retry remained running, as recorded in the second task-recovery Showboat snapshot.

### Accepted tasks and automatic build

The recovered task attempt completed at 13:45:57Z and its sandbox was destroyed. D1 accepted candidate `625c661fb734b426d972ad144b1df9d12500562b036417063b03b23b29a2fc1a`, tree `a6587b946b01a9ae0bc991d7e2f08ab2aef66673`, and the unchanged recovered patch. The [57-task plan](sac-182-accepted-tasks.md), [result](sac-182-accepted-task-result.json), [six validation checks](sac-182-accepted-task-validation.txt), and [six corrected source citations](sac-182-accepted-task-sources.json) were downloaded from R2 and hash-verified. Only `tasks.md` changed. The native transcript records 53 completed commands and no native web-search calls; real first-party document reads are proved separately.

The same Workflow advanced automatically to `implementation_build`, visit 33, at 13:46:02Z. Attempt `01a0a02a-ea7e-7034-94c4-31a3b1301fd7` uses fresh sandbox `impl-v1-cw637tfbteg2g3god7gl3662xpm6wya3dvcoqz5et4mbo4c7z4qa`, process `111e03dd-fdbd-4006-ba0c-ffdec4b9ef16`, and its own local data directory. At 13:56:26Z it was running with a current heartbeat. The [Showboat read-back](sac-182-implementation-build.md) and [authenticated portal screenshot](sac-182-build-running.png) record accepted checks, current implementation status and durable documentation citations.

The build allocated disposable [sample PR #22](https://github.com/sachinkundu/deos-sample-project/pull/22) and [Linear issue SAC-202](https://linear.app/sachinkundu/issue/SAC-202/canary-test-review-choices). GitHub read-back confirms the app-created PR on branch `deos/canary/01a0a02a-ea7e-7034-94c4-31a3b1301fd7`; Linear MCP confirms SAC-202 is in the frozen sample project at Human Review. These are setup facts. No changed-behavior provider proof, implementation completion, or SAC-182 implementation PR is claimed yet. The build's test resources remain active for its use and must be cleaned up after its attempt.

The agreed canary must use the real provider workflow through planning/design approval and automatic implementation to its PR. Its evidence must include the deployed version and container digest, fresh resource records, actual native web grounding, browser screenshots of the changed behavior, durable proof read-back, and the final GitHub PR subject. Concurrent tries must not share browser, preview, or test data. Exercise clarification, revision, and base movement deliberately where agreed; preserve human gates.

The existing portal staging configuration shares production D1/R2/backend. It must not stand in for isolated implementation test resources. Apply the additive migration before deploying code that queries it, verify activation, and select the new workflow only for the agreed route/run. Existing frozen definitions are unchanged. Do not publish the SAC-172 implementation PR until the agreed canary and remaining tests pass.
