# OpenSpec traceability review implementation evidence

Date: 2026-08-27

This evidence covers repository implementation, deployment, and one bounded OpenRouter contract probe. It does not yet claim a provider-originated workflow canary.

## Implemented boundary

- `simple-traceability` version 4 is bundled and registered under `DEOS Traceability`.
- Registration keeps the selector disabled. The existing `simple` workflow remains the default.
- The `DEOS Traceability` selector remains disabled while the controlled canary is prepared. The existing `simple` workflow remains the default for unmatched issues.
- The independent reviewer uses a frozen OpenRouter setting through a narrow Worker adapter. The author and review Sandboxes receive no GitHub, Linear, or OpenRouter secret.
- BettaView review assets are pinned to source revision `444d4e4addc7313e85e5dd5506abea12452ffcd4` and checked against `vendor/bettaview/bundle-manifest.json` before use.

## Repository validation

The following checks passed in `/private/tmp/deos-traceability-implementation`:

- `npm run typecheck`
- `npm run portal:typecheck`
- `npm test` — 159 tests passed
- `npm run portal:test` — 17 tests passed
- `npm run portal:build:full-workflow`
- `npm run portal:build`
- `npx openspec validate add-openspec-traceability-review --strict`
- `node --check container/supervisor.mjs`
- `node --check container/trace-review-runner.mjs`
- `uv run --with pytest pytest -q tests/test_trace_review_migration.py` — 2 tests passed
- `uv run --with pytest pytest -q` — 25 tests passed
- `uv run --with ruff ruff check src tests`
- all 14 D1 migrations applied to an empty local database, including `0013_openspec_traceability_review.sql`
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

The protected portal saved and read back provider `openrouter`, model `deepseek/deepseek-v4-pro`, revision 2, the authenticated operator, and the save time. [The live settings screenshot](assets/openspec-traceability-review-settings.jpg) shows the selected model, zero active runs, and the D1 read-back confirmation without exposing the secret.

## Controlled selector preflight

The first live preflight found that the deploy variable still named `sachinkundu/deos`, while the protected portal policy named `sachinkundu/deos-sample-project`. Selector lookup follows the saved policy repository, so the old registration could not match the sample project. Runtime head `cb499cd` fixes registration to use the saved D1 repository and adds a regression test. All 159 Worker tests and the Worker type checks passed before redeployment.

Linear issue [SAC-133](https://linear.app/sachinkundu/issue/SAC-133/show-review-readiness-before-plan-approval) was created in Backlog with the `DEOS Traceability` label, then moved to Rework. That non-start transition produced relevant delivery `98cdf6a0-71c9-4e2a-b60e-b012beeb180a` without allocating a workflow run. D1 then showed selector `simple-traceability` version 4, digest `fe52677cbe82792dc0d5382974be37fcfed371f4edaf0f7ae4284f246ae60524`, repository `sachinkundu/deos-sample-project`, and `enabled = 0`.

This preflight proves provider-originated label evidence and safe disabled registration. It does not yet prove the traceability workflow run.

## Container packaging

The local machine has no Docker CLI or Docker Desktop application. GitHub CI supplied the missing container-capable check. [CI run 33054094846, TypeScript job](https://github.com/sachinkundu/deos/actions/runs/33054094846/job/98456450146) built every Dockerfile layer, ran `codex-cli 0.147.0` and OpenSpec `1.8.0` inside the image, and exported Sandbox image `sha256:a954189818c2a612a408a02efde24b25a86c9e3d55df7c154db151b4014e7940`. The same job completed Worker, Python Worker, and portal Wrangler dry-runs.

## Live proof still required

Before implementation approval, the remaining proof must grant the GitHub App only the missing Check Run permission, enable the selector for the controlled label, and run one provider-originated canary. Completion evidence must include exact D1 rows, R2 hash read-back, the exact GitHub PR head and Check Run, the single updated Linear portal link, protected portal rendering, and Sandbox cleanup. The selector must then return to its approved post-canary state.
