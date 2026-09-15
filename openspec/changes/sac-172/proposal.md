## Why

The DEOS flow now stops after design approval. A person must still start the build from a laptop. The cloud flow cannot open a tested code pull request on its own.

## What Changes

- After the design is approved, merged, and checked, start a build agent with no local prompt.
- Let that agent create the task list, build the change, run checks, inspect web work in a service-owned browser, and fix what it finds.
- Require an independent Claude demo plan for every implementation, based on the approved proposal, specs, and design. Codex runs those demos. A fresh Claude demo gate inspects the evidence and must pass before PR publication.
- Show Demo Plan and Demo Gate as normal portal nodes, with requirements, results, visible evidence, and clear reasons for any work still needed.
- Give each run its own branch, work space, sandbox, browser, and safe test scope. Two runs must not share work or change the live site.
- If no safe choice is possible, ask one clear question on the Linear issue, enter human review, watch for an allowed reply, and then resume in a fresh attempt.
- Open one code pull request for human review. Put the task list, checks, and strong proof in it. Prefer visual proof. Use Showboat when a visual check does not fit. Unit tests alone are not proof.
- Keep merge and live release as later human choices. This flow must not deploy the change.

### Non-goals

- Do not remove the plan or design approval gates.
- Do not use a person's Google session or widen human access beyond the allowed Gmail account.
- Do not let an agent approve, merge, or release its own work.
- Do not treat a fake provider event as full provider proof.

## Capabilities

### New Capabilities

- `autonomous-implementation-workflow`: Runs the approved design through task creation, implementation, proof, clarification, and a code pull request for human review.

### Modified Capabilities

- `simplified-planning-workflow`: Continues a new fixed flow after the design merge instead of ending there.
- `sandbox-agent-execution`: Gives each implementation run isolated work, safe test space, browser use, web search, and durable recovery.
- `provider-capability-access`: Gives implementation work narrow service access without personal sessions, live release rights, or human approval rights.
- `workflow-observability`: Shows implementation progress, proof, questions, replies, and the final review work.

## Impact

This change affects the fixed flow, build jobs, sandbox setup, service access, proof, pull request posts, and the portal. It adds no live release step.

Cloudflare says each sandbox has its own files, tasks, and network: https://developers.cloudflare.com/sandbox/concepts/security/. Its browser API can use a service key and can limit the sites for each session: https://developers.cloudflare.com/api/resources/browser_rendering/subresources/devtools/subresources/browser/methods/create/.
