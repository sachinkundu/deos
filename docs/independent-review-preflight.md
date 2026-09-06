# Independent review preflight

Run from the repository root before deploying review transport changes:

```sh
node --experimental-strip-types scripts/probe-codex-structured-review.ts
```

This is a small paid OpenRouter test, not an offline dry run. It uses the
repository's `.env` key, the production Codex version (0.147.0), the production
argument builder, and the exact design-review output schema. The API key stays
in the host process; the isolated Codex process receives a dummy local token.

The local listener forwards Codex requests through `OpenRouterReviewClient`.
It does not rewrite the adapter's outgoing request. It checks that hosted
search and `parallel_tool_calls` are absent, and that strict schema routing
and the tested Baidu endpoint are required. It permits only a read of a small
random fixture, requires a real tool round-trip, and checks the final JSON
against that fixture. Markdown stripping and model-based repair are not used.

The test exits nonzero on a failed request, skipped fixture read, malformed
JSON, or wrong result. It has a four-request budget and a four-minute deadline.
It does not start a DEOS workflow, retry a stage, or touch Linear or GitHub.

## Evidence: 2026-09-06

- The original Codex request failed with OpenRouter HTTP 404. Removing the
  unsupported `parallel_tool_calls: false` parameter allowed routing.
- With hosted web search present, completed responses still contained Markdown
  fences despite the schema setting. Disabling hosted search avoided that path.
- Automatic routing was not a sufficient test contract: Baidu completed the
  fixture tool round-trip; two StreamLake requests returned a placeholder
  without reading the fixture. The review route now requires Baidu explicitly.
- The final production adapter passed the complete preflight:
  `gen-1788712410-6oI0RyY1dl8eFVhbr42j` (tool call),
  `gen-1788712412-85r8vZjA6Y55K9dpq4XR` (valid final JSON).

This proves the request contract with a real model, not the quality or success
of a full design review. Verify backend activation separately. SAC-156 remains
an operator-controlled retry. If the pinned endpoint is unavailable, fail
routing rather than silently fall back to an unverified host.
