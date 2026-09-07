## Why

Debugging SAC-156 required repeated paid runs because error wrappers dropped provider details or replaced the first failure with a retry error. Operators need the actual cause from one failed run, not another run to discover what happened.

## What Changes

- Preserve original error messages, causes, stack traces, provider status, response bodies, and response headers in protected diagnostics. Categories remain labels, not replacements.
- Carry those details and their diagnostic reference through provider adapters, retries, process runners, workflow state, and the authenticated portal.
- Remove application-imposed size caps on diagnostic and artifact capture. If the real runtime or storage provider rejects evidence, report that exact failure and keep recoverable evidence.
- Record original and secondary failures together, including failures while reading streams, saving diagnostics, validating output, or cleaning up.
- Apply the same error behavior to local replay tools. Keep credentials out of public output without dropping the useful error.
- **BREAKING**: provider-facing proxy failures retain the upstream status when available instead of always becoming 502 or a later generic 409. Historical diagnostics stay readable; missing historical detail is reported as unavailable.

Non-goals: changing review findings or schemas, adding workflow retries, bypassing human gates, changing timeouts, deploying the portal, or replaying SAC-156 as part of this planning stage.

## Capabilities

### New Capabilities

- `original-error-diagnostics`: Preserve and expose the actual failure across all execution boundaries and local diagnostics.

### Modified Capabilities

- `sandbox-agent-execution`: Remove application size-based evidence rejection while preserving evidence-before-cleanup and credential isolation.

## Impact

Affected areas include OpenRouter Responses and Chat adapters, GitHub and Linear adapters, capability replay, protected diagnostic storage, runner and supervisor failures, artifact collection, workflow summaries, portal error retrieval, and local preflight/replay tools.

This changes existing TypeScript and JavaScript components; a language migration is not required. Storage use can grow because evidence is no longer silently truncated. The related incident is SAC-156; no issue state or current run is changed.
