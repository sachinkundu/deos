# OpenSpec traceability review implementation evidence

Date: 2026-08-27

This evidence covers repository implementation, deployable packaging, and one bounded OpenRouter contract probe. It does not claim a DEOS deployment or provider-originated workflow canary.

## Implemented boundary

- `simple-traceability` version 4 is bundled and registered under `DEOS Traceability`.
- Registration keeps the selector disabled. The existing `simple` workflow remains the default.
- No traceability label, live selector, remote migration, Cloudflare secret, deployment, or canary was changed for this implementation proof.
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

## Container packaging

The local machine has no Docker CLI or Docker Desktop application. GitHub CI supplied the missing container-capable check. [CI run 33054094846, TypeScript job](https://github.com/sachinkundu/deos/actions/runs/33054094846/job/98456450146) built every Dockerfile layer, ran `codex-cli 0.147.0` and OpenSpec `1.8.0` inside the image, and exported Sandbox image `sha256:a954189818c2a612a408a02efde24b25a86c9e3d55df7c154db151b4014e7940`. The same job completed Worker, Python Worker, and portal Wrangler dry-runs.

## Live proof still required

Before implementation approval, an authorized activation must apply the remote migration and secret/config changes, deploy the Worker and portal, verify GitHub Check Run and Linear comment permissions, enable the selector for a controlled label, and run one provider-originated canary. Completion evidence must include exact D1 rows, R2 hash read-back, the exact GitHub PR head and Check Run, the single updated Linear portal link, protected portal rendering, and Sandbox cleanup.
