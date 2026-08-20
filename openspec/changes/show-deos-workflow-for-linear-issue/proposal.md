## Why

People cannot currently answer where a Linear issue is in its governed DEOS workflow without resolving internal identifiers and inspecting several infrastructure systems. SAC-123 now provides an approved visual target, and the durable D1 records proven by SAC-122 are sufficient to build one issue-centred, live business view without creating another workflow or status authority.

## What Changes

- Add an operator-authenticated view that accepts a Linear issue key, selects its latest or requested DEOS run, and presents D1 as the sole authority for workflow status and history.
- Project an explicit safe read model containing the run status, current or terminal node, frozen definition version and digest, ordered traversals, repeated visit identities, bounded wait guidance, agent attempts, planning artifacts, governed pull requests, and access-controlled transcript destinations. Derive the visible graph from an allowlist of structural node and edge fields; the displayed digest identifies the complete frozen definition but does not claim that the prompt-free projection hashes to that digest.
- Render the approved two-row workflow map with repeated review work grouped into stages and cycle counts while retaining every ordered visit and agent run in the detailed history.
- Make current, waiting, finished, failed, unavailable, and changing states clear; link required human action back to Linear; and refresh often enough to follow a live run without guessing between reads.
- Preserve the approved System, Light, and Dark themes, restrained active-state motion, reduced-motion fallback, and hosting-provider-neutral product language.
- Protect every response with operator authentication and an explicit safe-field allowlist. Exclude the full canonical definition document, credentials, prompts, provider payloads, raw matcher or diagnostic content, unrestricted artifact bodies, and Cloudflare execution fields or identifiers.
- Require deterministic API, projection, redaction, authorization, UI, polling, and accessibility coverage plus provider-originated evidence for a live wait/resumption path and a terminal path, with sanitized screenshots and read-only D1 proof.

### Non-goals

- Changing workflow lifecycle, graph, human-approval, or Linear transition semantics.
- Adding another event, telemetry, or workflow-state system.
- Showing Cloudflare executor status, infrastructure diagnostics, or provider-native Workflow visualization.
- Consolidating workflow pull requests or implementing the related SAC-99, SAC-100, or SAC-102 work.
- Treating synthetic ingress or deterministic tests as provider-originated end-to-end proof.

## Capabilities

### New Capabilities

- `workflow-operator-view`: Resolve a Linear issue key into a safe, authenticated, live projection of its D1-authoritative DEOS workflow graph, history, waits, agent runs, and governed work products.

### Modified Capabilities

None.

## Impact

- Linear issues: SAC-101, with the visual direction approved by completed prerequisite SAC-123.
- Expected implementation areas after approval: authenticated Worker routes, D1 read projection and any safe issue-key index, access-controlled artifact navigation, the operator web interface, polling and unavailable-state handling, tests, and provider-originated visual/D1 evidence.
- The existing workflow definition, state transitions, provider capabilities, and operator-facing lifecycle semantics remain unchanged.
