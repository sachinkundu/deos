# Original-error audit

The user requested implementation and deployment on 2026-09-07. This supersedes the planning-only scope of PR #86. SAC-160 must not be retried by this change.

## Coverage

Reviewed catch/except boundaries in application TypeScript, Python ingress, container runners, portal code and local tools. Provider response rejection paths were reviewed alongside catches. Expected input-validation fallbacks retain their behavior; workflow catches preserve original exceptions before classification. Uncaught exceptions continue to propagate.

| File | Catch boundaries |
| --- | ---: |
| `container/author-completion.mjs` | 2 |
| `container/design-review-runner.mjs` | 1 |
| `container/original-errors.mjs` | 1 |
| `container/supervisor.mjs` | 7 |
| `container/trace-review-proof.mjs` | 5 |
| `container/trace-review-runner.mjs` | 1 |
| `portal/src/TranscriptViewer.tsx` | 1 |
| `portal/src/main.tsx` | 8 |
| `portal/src/model.ts` | 1 |
| `portal/src/routes.ts` | 1 |
| `portal/src/story.ts` | 3 |
| `portal/src/transcript-view.ts` | 1 |
| `portal/src/transcript.ts` | 1 |
| `portal/src/worker.ts` | 3 |
| `scripts/probe-codex-structured-review.ts` | 1 |
| `scripts/replay-design-review-local.ts` | 3 |
| `src/artifact-collector.ts` | 5 |
| `src/capability-auth.ts` | 1 |
| `src/capability-router.ts` | 15 |
| `src/capability-store.ts` | 1 |
| `src/cleanup-audit.ts` | 4 |
| `src/credential-vault.ts` | 4 |
| `src/deos/ingress.py` | 4 |
| `src/deos-workflow.ts` | 1 |
| `src/design-candidate.ts` | 1 |
| `src/entry.py` | 4 |
| `src/error-context.ts` | 2 |
| `src/error-details.ts` | 2 |
| `src/github-capability.ts` | 21 |
| `src/linear-capability.ts` | 3 |
| `src/linear-transition.ts` | 2 |
| `src/openrouter-review.ts` | 9 |
| `src/orchestration-store.ts` | 1 |
| `src/planning-store.ts` | 1 |
| `src/provider-diagnostics.ts` | 2 |
| `src/queue-consumer-core.ts` | 8 |
| `src/queue-consumer.ts` | 1 |
| `src/repository-routes.ts` | 1 |
| `src/route-admin.ts` | 9 |
| `src/sandbox-controller.ts` | 13 |
| `src/stage-retry.ts` | 6 |
| `src/system-actions.ts` | 8 |
| `src/workflow-definition.ts` | 3 |
| `src/workflow-orchestrator.ts` | 3 |
| `src/workflow-runtime-recovery.ts` | 6 |
| `src/workflow-services.ts` | 6 |

## Behavior

- Each workflow step and verified capability request collects original errors in a separate async context.
- Exceptions keep names, messages, stacks, cause chains and custom fields. Error context wrappers retain their cause.
- Full diagnostic objects are stored in R2. D1 indexes them for the portal. Storage failures preserve both exceptions in Workers logs and the thrown AggregateError.
- GitHub, Linear and OpenRouter retain actual HTTP/GraphQL errors. Interrupted reads retain the received prefix and transport error.
- Containers write original errors to stderr and a collected JSONL file. Artifact contents are not filtered or rejected by artificial byte caps; credential files remain excluded.
- The portal shows errors above the map, including historical categories whose original text was never saved. Complete details remain behind Cloudflare Access.
- Existing retry, admission, human-review and workflow-definition behavior is unchanged.

## Evidence boundary

Tests exercise caught-and-classified errors, concurrent run isolation, diagnostic-storage failure, complete HTTP details, interrupted streams, artifact preservation, and protected portal retrieval. A deployment is not a successful retry of SAC-160.
