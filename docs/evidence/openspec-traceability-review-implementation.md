# OpenSpec traceability review implementation evidence

Date: 2026-08-28

This evidence covers repository implementation, deployment, the failed canaries that exposed the retry defects, and the completed provider-originated SAC-139 run. SAC-139 preserved its earlier author and self-check work, resumed only its failed independent-review tail, completed both OpenRouter directional passes, recorded the author's response, updated GitHub and Linear, and reached Human Review.

## Implemented boundary

- `simple-traceability` version 12 is the project default. The legacy `DEOS Traceability` selector remains registered and disabled.
- The independent reviewer uses a frozen OpenRouter setting through a narrow Worker adapter. The author and review Sandboxes receive no GitHub, Linear, or OpenRouter secret.
- BettaView review assets are pinned to source revision `de22c3cf9a95285647bbf31cac1d6242bef6142a`. A repository test now recomputes every hash in `vendor/bettaview/bundle-manifest.json` so changed review bytes cannot retain an older manifest identity.

## Repository validation

The following checks passed in `/private/tmp/deos-traceability-implementation`:

- `npm run typecheck`
- `npm run portal:typecheck`
- `npm test` — 199 tests passed
- `npm run portal:test` — 17 tests passed
- `npm run portal:build:full-workflow`
- `npm run portal:build`
- `npx openspec validate add-openspec-traceability-review --strict`
- `node --check container/supervisor.mjs`
- `node --check container/author-completion.mjs`
- `node --check shared/planning-language.mjs`
- `node --check container/trace-review-runner.mjs`
- `uv run --with pytest pytest -q tests/test_trace_review_migration.py` — 2 tests passed
- `uv run --with pytest pytest -q` — 25 tests passed
- `uv run --with ruff ruff check src tests`
- all 15 D1 migrations applied to an empty local database, including `0013_openspec_traceability_review.sql` and `0014_agent_attempt_result_detail.sql`
- Worker `wrangler deploy --dry-run --containers-rollout=none`
- portal `wrangler deploy --dry-run`

Wrangler generated and checked the Worker and portal binding types. The Worker dry run recognized the Sandbox container binding while suppressing the container rollout.

## OpenRouter provider contract proof

The ignored local `.env` contains `OPENROUTER_API_KEY`; its value was never printed or committed. On 2026-08-27, the authenticated OpenRouter models endpoint returned `deepseek/deepseek-v4-pro` with `reasoning_effort`, `response_format`, and `structured_outputs` support.

One bounded live completion then used that exact model, `reasoning.effort: high`, and a strict JSON schema. OpenRouter returned request `gen-1787819851-I4pVj7dk5vVgzSHpshWr`, model `deepseek/deepseek-v4-pro`, content `{"ok": true}`, `finish_reason: stop`, 16 prompt tokens, 47 completion tokens, and 41 reasoning tokens. The total provider-reported cost was `$0.00012441`.

This is real OpenRouter contract proof. It is not a DEOS end-to-end run: it did not originate in Linear, traverse the deployed Worker or Sandbox, write D1/R2 review proof, or update GitHub and the protected portal.

## Live deployment proof

Cloudflare D1 applied `0013_openspec_traceability_review.sql` and then reported no pending migrations. Read-back showed all four traceability tables and all five independent-review policy columns.

Wrangler uploaded the ignored local key as Worker secret `OPENROUTER_API_KEY`. A secret-list read-back confirmed the name without exposing its value.

Corrected runtime head `cb499cd` produced:

- Worker version `fd6f93aa-ab54-49ee-b882-4c068c6a5e6f`;
- portal version `4175e38e-9452-4b4e-b597-8dbb67907001`; and
- Sandbox container image `sha256:d342fb3e5be621d087b3f445280d51971145e5724fcf331bc8325e418f370d84`.

Container application read-back showed version 7, five healthy instances, zero active instances, and no health errors.

Version 6 runtime head `9f5d3ff` produced Worker version `6df1f154-b93e-4f15-aec7-8fec8c94cfc2`, portal version `fc23ef8b-a763-43b3-a8e3-7705cbd5e9d2`, and Sandbox image `sha256:04ab0dddd111bde07a8f85f09c2d92b81613fa9bb5bd0d1dbb50fa91b5724bd2`. Container application read-back showed version 8, five healthy instances, and no health errors before the version 6 canary.

The protected portal saved and read back provider `openrouter`, model `deepseek/deepseek-v4-pro`, revision 2, the authenticated operator, and the save time. [The live settings screenshot](assets/openspec-traceability-review-settings.jpg) shows the selected model, zero active runs, and the D1 read-back confirmation without exposing the secret.

## Controlled selector preflight

The first live preflight found that the deploy variable still named `sachinkundu/deos`, while the protected portal policy named `sachinkundu/deos-sample-project`. Selector lookup follows the saved policy repository, so the old registration could not match the sample project. Runtime head `cb499cd` fixes registration to use the saved D1 repository and adds a regression test. All 159 Worker tests and the Worker type checks passed before redeployment.

Linear issue [SAC-133](https://linear.app/sachinkundu/issue/SAC-133/show-review-readiness-before-plan-approval) was created in Backlog with the `DEOS Traceability` label, then moved to Rework. That non-start transition produced relevant delivery `98cdf6a0-71c9-4e2a-b60e-b012beeb180a` without allocating a workflow run. D1 then showed selector `simple-traceability` version 4, digest `fe52677cbe82792dc0d5382974be37fcfed371f4edaf0f7ae4284f246ae60524`, repository `sachinkundu/deos-sample-project`, and `enabled = 0`.

This preflight proves provider-originated label evidence and safe disabled registration. It does not yet prove the traceability workflow run.

## First provider-originated canary finding

At `2026-08-27T10:47:11.889Z`, Linear moved SAC-133 from Rework to Todo. Delivery `5c2086e3-0bf2-499a-9657-d677f56643ea` allocated run `workflow:99426d9b-cda7-4db4-9136-692a95a0b090:946c431b-7080-48ba-8a4b-c435e7777610:run:1` and Cloudflare Workflow instance `wf-v1-itjo7sp4ccup5usmh27lvycezt5egghf3ymk56wsfpdmz2rfcvka`. D1 froze `simple-traceability` version 4, the expected definition digest, Codex `gpt-5.6-sol` with high reasoning, and OpenRouter `deepseek/deepseek-v4-pro` with high reasoning. The selector was disabled again after allocation; D1 read it back as `enabled = 0` at `2026-08-27T10:48:39.111Z`.

The first author attempt completed with a full six-object R2 manifest but was correctly classified `invalid_candidate` by the trusted candidate builder. Its own OpenSpec and repository checks had passed. A separate replay of the trusted readability function against the saved patch showed that `proposal.md` scored Ease `48.84`, Grade `9.97`, and the delta spec scored Ease `15.45`, Grade `25.19`. Both missed the required Ease of at least 70 and Grade of at most 8.

The second author attempt then produced the same `patch.diff` byte-for-byte. Both manifests recorded patch SHA-256 `1804eee3c10a3052688016be0953ec4c6c30db46f9e539aadb2445bd70e04f0e`. The old code stored only `invalid_candidate`, so the next author did not receive the trusted failure reason and the workflow followed the same self-loop. This is real evidence of duplicate token use, not a mock or a test.

The canary Workflow was paused and then terminated after the duplicate was proven. A third author process had already started before the pause landed, but termination prevented a fourth workflow retry. No planning candidate or GitHub pull request was published, and no semantic reviewer ran. The selector remained disabled.

Version 5 saved the trusted rejection reason and stopped only a byte-identical repeat. The next provider-originated run showed why that was not enough. Run `workflow:99426d9b-cda7-4db4-9136-692a95a0b090:946c431b-7080-48ba-8a4b-c435e7777610:run:2` created three distinct author attempts. The first failed the proposal reading check at Ease `51.4`, Grade `9.39`. The second changed the plan but failed the delta spec at Ease `34.04`, Grade `18.33`. The third passed and moved to self-discovery. Each wording correction had consumed a fresh Workflow visit, attempt, and Sandbox even though no semantic review had requested it.

The operator disabled the selector and terminated Workflow instance `wf-v1-4dqje4dqkz4h37kml56yatr3vbrilmmzgf6ulyaif2qkl4prl3pq`. The remaining self-discovery process had already exited with code 1. Its exact Sandbox `sbx-v1-ene65nsebdjnvo2cjriztrwof2feqdmmopzi73ydbycwdcwcywlq` was destroyed. D1 then read back attempt `01a04310-2d70-798a-bd1e-344dd0d3714b` with `state = canceled` and `cleanup_state = destroyed`, and the run with `status = canceled` and cause `operator_canceled_for_same_session_author_hook_rollout`.

Version 6 moves deterministic correction into the trusted supervisor. It resumes the exact saved Codex session in the same Sandbox, with at most two in-place repairs after the first completion. `author-completion.json` records each round and its scores. The Worker imports the same scorer and treats any post-hook rejection as `author_completion_verification_mismatch`. All three `invalid_candidate` graph edges point to failure, so a deterministic rejection cannot start another author attempt. Focused tests cover a hard draft that passes after one exact-session correction, the two-repair bound, shared score behavior, and the terminal Worker mismatch. A fresh provider-originated canary is still required after version 6 is deployed.

## Version 6 provider-originated author proof

The scheduled registry refresh stored `simple-traceability` version 6 with digest `958044b1b2f43a48563c25747f1acd327303dc50f95fa21ce7f075404ebfd8d7` while preserving `enabled = 0`. The operator enabled only that exact selector, moved SAC-133 from Rework to Todo through Linear, observed the new durable run, and disabled the selector again.

Two diagnostic runs stopped before prompt staging because the manually canceled version 5 run still held the single `controlled-trial` credential lease. D1 tied that lease to attempt `01a04310-2d70-798a-bd1e-344dd0d3714b`, whose state was `canceled` and cleanup state was `destroyed`; Cloudflare inventory showed its exact Sandbox inactive. The operator released only that lease row under guards for the exact attempt, terminal state, cleanup state, and Sandbox identity. The encrypted credential object was not changed.

The next Linear delivery allocated run `workflow:99426d9b-cda7-4db4-9136-692a95a0b090:946c431b-7080-48ba-8a4b-c435e7777610:run:5` and Workflow instance `wf-v1-wukfwy4d5ykiuiorm3q6wfbeecgi5faa4usc33ogasngfkrutfoq`. D1 froze workflow version 6 and recorded one author attempt: `01a0433f-ad13-7216-b770-eb6ad77cf8bd`. That attempt used Sandbox `sbx-v1-slydpabzecj7ffdrpqdqfodforbxglqjd3xpa7iskgfdtlmyekaa`, completed, and read back with cleanup state `destroyed`. No second `planning_author` attempt or visit exists.

The trusted `author-completion.json` receipt has SHA-256 `4a87cf4d77630583d340189eb056f1ec8360648fbc17e6ec00e88f740229804c` in both D1 and a direct R2 read-back. It records one Codex session, `01a04340-0fef-75d2-9cbb-b2cdf4d47ca8`, and `repairCount = 1`. Round 0 passed path, strict OpenSpec, and whitespace checks. The proposal passed at Ease `76.42`, Grade `5.29`; the spec failed at Ease `57.76`, Grade `13.16`. Round 1 is marked `same_session_resume`. It reused the same checkout, attempt, Sandbox, process supervisor, and Codex session. The corrected spec passed at Ease `76.45`, Grade `5.98`; the proposal remained unchanged and passing.

The Worker accepted candidate `candidate:01a0433f-ad13-7216-b770-eb6ad77cf8bd`, then advanced the run directly from `planning_author` visit 2 to semantic `self_discovery` visit 3. This is real provider-originated proof that readability correction consumes no BettaView review turn, no workflow author retry, and no new Sandbox.

The version 6 self-discovery reviewer returned four substantive findings, but its trace proof was not bidirectional: link `show-both-review-states` cited proposal line 11 while proposal line 11 did not map back to that link. The pinned BettaView validator rejected the trace and the review attempt ended `codex_exit_nonzero`. This happened in self-discovery after the successful author stage. It did not create another author attempt or readability cycle.

That canary exposed an existing contract gap. The approved spec allows bounded proof repair and the result schema already records up to two repairs, but the runner loop was hard-coded to one output. Version 7 added the missing same-attempt loop, then run 6 exposed one CLI packaging error: `codex exec resume` rejected the initial-only `--sandbox` option before the repair prompt ran. Version 8 passes only options accepted by the resume subcommand. It gives the same reviewer attempt the exact validator failure and at most two proof repairs against the same immutable plan. Codex resumes the exact reviewer session; OpenRouter stays inside the same attempt through the trusted adapter. Trusted code rejects any repair that changes the first finding set. Focused tests prove exact-session reuse, the fixed bound, finding-set preservation, and the exact initial-versus-resume argument contract.

## Container packaging

GitHub CI supplied the clean container-capable check. [CI run 33071291906, TypeScript job](https://github.com/sachinkundu/deos/actions/runs/33071291906/job/98513927481) built every Dockerfile layer, ran `codex-cli 0.147.0` and OpenSpec `1.8.0` inside the image, and exported local Sandbox image `sha256:45bb0b317307b0f2f96156458d6fc7d88af72ceaa12a8cb241924e24ee64c243`. The same job completed Worker, Python Worker, and portal Wrangler dry-runs. The deployed registry image has digest `sha256:04ab0dddd111bde07a8f85f09c2d92b81613fa9bb5bd0d1dbb50fa91b5724bd2`; a local run of that exact image verified the supervisor, author hook, shared scorer, Git, Node, Codex CLI, and OpenSpec binaries.

## Earlier live proof gaps

Version 8 run 7 proved the readability boundary with real provider ingress. The first author draft scored 69.31 Reading Ease and 6.28 grade in `proposal.md`. The trusted completion hook resumed Codex session `01a04378-bbed-70d2-abac-7b634d112ded` inside attempt `01a04378-8de0-73bc-88fd-5c349af8163d`; the repaired draft scored 79.60 and 4.16. D1 recorded one `planning_author` visit and one attempt, while the accepted R2 receipt recorded `repairCount: 1` and matched SHA-256 `32d6bb7e1451561866f8b9d03fc8b789dcd21575d0c5ef420cf24ba75befe6fe`.

The same run then proved bounded review-proof repair. One self-discovery job returned four semantic findings. Its three raw outputs held one unchanged finding set, while two same-attempt proof repairs produced accepted review `review:01a04382-5297-7893-b027-0a4262723780`. D1 recorded `review_job_count = 1` and `proof_repair_count = 2`. The semantic repair passed readability on its first local check. The following recheck exposed a separate response-schema packaging defect before model work: Codex rejected `oneOf` for nullable `causalSourceDigest`. Version 9 replaced that construct with the supported nullable `type` array.

Version 9 run 8 proved the repaired schema reached model execution. Codex returned the exact two required resolutions, but the recheck runner compared the provider wrapper `{ result, sessionId }` with the closed inventory instead of comparing its nested result. Version 10 normalizes Codex and OpenRouter outputs to one provider-neutral payload before validation and has a focused regression test for both providers.

These gaps were resolved by the version 12 SAC-139 run below.

## Completed SAC-139 provider-originated canary

Linear issue [SAC-139](https://linear.app/sachinkundu/issue/SAC-139/specify-a-calculator-cli) requested a calculator CLI proposal and specifications. Its real Linear delivery allocated run `workflow:99426d9b-cda7-4db4-9136-692a95a0b090:dcde8049-91b0-4f81-a6ad-ca57b3f968a1:run:1`. The run froze author `codex/gpt-5.6-sol` and independent reviewer `openrouter/deepseek/deepseek-v4-pro`.

The self-check first returned findings in review `review:01a0472e-76ac-77ce-bb4b-1848631717d0`. One fresh author repair attempt responded to that fixed finding set. Review `review:01a04739-1252-7584-82c9-8295a947d2f7` then passed the closed-set recheck. D1 closed the self-check phase after two review jobs and no proof repair.

The initial independent-review Workflow tail failed under version 11. The guarded retry preserved the run, candidate, planning pull request, earlier reviews, and provider evidence while replacing only the failed Workflow tail with version 12 instance `wf-v1-h32cy2sylafl4dohqsqeltaezjclsmrdpoyjjzzle7qz4nlfnbcq`. It did not rerun the author or self-check prefix.

Independent review attempt `01a04805-0f3e-7643-a22d-aafbd9bde4eb` ran the pinned Codex `0.147.0` harness with OpenRouter model `deepseek/deepseek-v4-pro`. Two fresh Responses calls succeeded:

- `gen-1787914692-UI08zMYKGQS58a1BCRL4` for the first direction; and
- `gen-1787914734-5QAgqL5UJQXec4mCqHNr` for the second direction.

Trusted validation accepted review `review:01a04805-0f3e-7643-a22d-aafbd9bde4eb` as `pass` with prompt `openspec-semantic-traceability-directional-v3`. Its R2 manifest contains 10 objects and 103,146 bytes with aggregate digest `e7c2baa59b5d3c78dbc747c87c57c203fa320c5cc508e49ad98b6832c249b849`. D1 closed the independent phase after one review job and zero proof repairs for exact head `1d98fffb9eba10f330d64bc3428e5dee6f6a824e`.

Author-response attempt `01a04809-e591-7814-af43-82a2545ca1dc` completed in a fresh Sandbox. It recorded all nine directional review items as `no_change`, with a reason for each. Its R2 manifest contains 8 objects and 43,541 bytes with aggregate digest `09b109ab050a82ad1ab9f8e0042226192ddb27a2f07c353b7961d06cfe04eef5`. Every Sandbox used by the successful author, self-check, repair, independent review, and author response reads back as terminal with `cleanup_state = 'destroyed'`.

Trusted provider work left one current result at each target:

- [planning pull request #5](https://github.com/sachinkundu/deos-sample-project/pull/5) is open, ready for review, and still at exact head `1d98fffb9eba10f330d64bc3428e5dee6f6a824e`;
- GitHub Check Run `98830432480` is `SUCCESS` and links to the protected review route;
- Linear comment `08efde09-3ccc-41bf-a5a6-fbe9b7f6f83b` reports 0 applied, 0 declined, and 9 no-change dispositions; and
- the signed Linear transition placed SAC-139 in `Human Review`.

Final D1 read-back shows definition version 12, node `planning_review`, visit 17, and status `awaiting_human` at `2026-08-28T11:09:04.908Z`. The protected review URL returns a Cloudflare Access login redirect with `Cache-Control: no-store`. No signed-in browser screenshot was captured; the durable D1/R2 projection, exact provider links, and protected route are the preserved portal proof.

The canary used the corrected reviewer bytes but exposed that their vendored manifest still named the previous BettaView revision and hashes. The manifest now names `de22c3cf9a95285647bbf31cac1d6242bef6142a`, its file hashes match every vendored asset, and a new integrity test prevents recurrence. The corrected Worker/container deployment is recorded separately from the immutable SAC-139 review evidence; it does not rewrite that completed run.

The corrected deployment produced Worker version `e83df30b-e405-4eb8-85e2-c60c64f589c4` and Sandbox container image `sha256:28f04e0718e10165515f32945970ef8f530ea395c9c521752709e049c10ab66f`. Container read-back at `2026-08-28T11:43:18.159Z` showed application version 26 in `ready` state with five instances. This proves the manifest correction and integrity test are present in the deployed runtime; it does not claim that the already completed SAC-139 run was regenerated.
