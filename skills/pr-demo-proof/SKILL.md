---
name: pr-demo-proof
description: Prepare implementation PRs with honest live evidence, Showboat output, and sanitized visual screenshots attached for review. Use when a change needs demonstration proof, external integration evidence, or a review-ready PR handoff.
---

# PR Demo Proof

Use this workflow for implementation PRs where behavior can be shown.

## Evidence order

1. Establish the real trigger using the provider's semantic tool/API. For
   Linear, use Linear MCP for issue creation and transitions.
2. Use the provider UI only for login, configuration that lacks an API/MCP
   operation, or visual inspection.
3. Use the deployment platform's CLI/API for deployment and resource state. For
   Cloudflare, use Wrangler or the Cloudflare API, not a browser dashboard.
4. Capture durable remote output with Showboat or an equivalent artifact.
5. Capture sanitized screenshots of the most informative states: provider
   configuration and resulting issue/resource state.

## PR packaging

- Put the proof artifact in the repository when it is safe and useful.
- Attach or embed screenshots in the PR body or a PR comment. If direct upload
  is unavailable, commit sanitized images under a clearly named evidence path
  and link them with the PR branch URL.
- State exactly what each image proves and identify any remaining synthetic
  evidence.
- Never include API tokens, webhook secrets, cookies, private URLs, or
  unrelated workspace data in screenshots.
- Do not report tests as demonstration proof. Tests may be listed separately,
  but the PR proof section must lead with the live action and observable result.

## Completion gate

A PR is demonstration-ready only when the reviewer can answer:

- What real action triggered the behavior?
- Which external system emitted or received it?
- What durable remote record proves the result?
- Which screenshot shows the configured or visible state?
- Is any part still synthetic or unverified?

If any answer is unknown, label the PR as blocked or partial instead of
claiming end-to-end success.
