# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## SAC-123 design decisions

- Preserve the selected dark, blue-charcoal workflow-map visual direction while supporting System, Light, and Dark themes.
- Present cyclic workflows as a stable canonical route with explicit curved return edges, visit counts, and chronological run history; do not imply that the workflow is a linear topological ordering.
- Keep product language provider-neutral. Never expose Cloudflare, D1, R2, Worker, storage, runtime, or other infrastructure terminology in the interface.
- Treat the product as live and event-driven. The compiled browser client is only the presentation layer; freshness, live updates, and status changes come from a dynamic backend contract.
- Keep this prototype local and self-contained. Do not attach prototype iterations to Linear unless the user explicitly asks.
- Make live work unmistakable with restrained motion: the active workflow card breathes, and the matching active issue in the left rail has a breathing activity indicator. Preserve a clear static active treatment when reduced motion is requested.
- Render the checked-in `simple` version-4 workflow as the current visual subject. Group its technical nodes into readable stages, but keep every node and collapsed edge covered by the safe presentation manifest so the UI cannot silently hide a new step.
- Label the `planning_review` gate as `Human approval`: a person approves in Linear by moving the issue to `Merging`. Label the following merge and verification stage as automatic work so the approval boundary stays clear.
