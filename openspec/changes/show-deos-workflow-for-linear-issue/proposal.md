## Why

People cannot currently answer where a Linear issue is in its governed DEOS workflow without resolving internal identifiers and inspecting several infrastructure systems. SAC-123 now provides an approved visual target, and the durable D1 records proven by SAC-122 are sufficient to build one issue-centred, live business view without creating another workflow or status authority.

## What Changes

- Deploy the portal behind Cloudflare Access with Google login and a default-deny policy that permits only `sachinkundu@gmail.com`.
- Accept a Linear issue key, select its latest or chosen DEOS run sequence, and present D1 as the sole authority for workflow status and history.
- Read the immutable workflow definition snapshot selected when the run started and render its node-and-edge structure in the approved concise view. Show the stored version and digest as provenance, but never return the full snapshot because it also contains execution-only content such as prompts.
- Render the approved two-row workflow map with repeated review work grouped into stages and cycle counts while retaining every ordered visit and agent run in the detailed history.
- Make current, waiting, finished, failed, unavailable, and changing states clear; link required human action back to Linear; and poll the authenticated read endpoint often enough to follow a live run without guessing between reads. D1 does not provide a browser-facing change hook, and push or streaming updates are deferred from the first version.
- Preserve the approved System, Light, and Dark themes, restrained active-state motion, reduced-motion fallback, and hosting-provider-neutral product language.
- Grant resource access only to the portal backend through the minimum D1, R2, and server-side Linear bindings or credentials it needs. Expose only read operations, provide no workflow mutation or provider-capability binding, and send no resource credential or binding to the browser.
- Protect every response with an explicit safe-field allowlist. Exclude the full canonical definition document, credentials, prompts, provider payloads, raw matcher or diagnostic content, unrestricted artifact bodies, and Cloudflare execution fields or identifiers.
- Require deterministic API, projection, redaction, authorization, UI, polling, and approved reduced-motion coverage plus provider-originated evidence for a live wait/resumption path and a terminal path, with sanitized screenshots and read-only D1 proof.

### Non-goals

- Changing workflow lifecycle, graph, human-approval, or Linear transition semantics.
- Adding another event, telemetry, or workflow-state system.
- Showing Cloudflare executor status, infrastructure diagnostics, or provider-native Workflow visualization.
- Adding push or streaming updates in the first version.
- Consolidating workflow pull requests or implementing the related SAC-99, SAC-100, or SAC-102 work.
- Treating synthetic ingress or deterministic tests as provider-originated end-to-end proof.

## Capabilities

### New Capabilities

- `workflow-operator-view`: Resolve a Linear issue key into a safe, authenticated, live projection of its D1-authoritative DEOS workflow graph, history, waits, agent runs, and governed work products.

### Modified Capabilities

None.

## Impact

- Linear issues: SAC-101, with the visual direction approved by completed prerequisite SAC-123.
- Expected implementation areas after approval: a Cloudflare Access application and single-email Google policy, authenticated Worker routes, least-privilege resource bindings, D1 read projection and any safe issue-key index, access-controlled artifact navigation, the operator web interface, polling and unavailable-state handling, tests, and provider-originated visual/D1 evidence.
- The existing workflow definition, state transitions, provider capabilities, and operator-facing lifecycle semantics remain unchanged.
