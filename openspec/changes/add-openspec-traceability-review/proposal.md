## Why

The first simple planning run worked. DEOS made a plan, revised it, and merged it. Yet a person saw the plan before another agent checked its meaning. We want that check first. It should find gaps early and save human review for a plan that is ready.

## What Changes

- Keep a plan private until its first review passes.
- Give the first reviewer fresh context. Use the same fixed model and settings as the author. Limit repairs. Rechecks cover only the first review's findings. A repair can change only the full plan and spec blocks tied to those findings. Recheck every changed block and all of its two-way links.
- Open one planning pull request after the first review passes. Use a different fixed model for the second review. Repair the same pull request. Recheck its open findings before human review.
- Keep each draft, test, note, source, and fix as a record. Do not let these records change. Store them outside the standard OpenSpec files.
- Bind the first check to one exact draft. Bind the later check to one exact pull request version. Show its proof and result in a view that needs a login. Clearly mark the check current or stale. Keep GitHub and Linear notes short. Link them to this view.
- Start a new review round when a person asks for a change to the plan. A person must still make the approval choice.
- Let review agents read but not write. Trusted workflow steps can open or update the pull request, post its check, and add its Linear link.
- Run each review in a new DEOS Sandbox. Pin one BettaView review tool version. DEOS owns the workflow and saved proof. It also owns login and provider changes.
- Set a firm limit for each review and repair loop. Stop before human review if the work fails or uses all its tries.

### Non-goals

- Add review IDs, links, hashes, or marks to standard OpenSpec files.
- Claim that an agent review makes every plan correct.
- Let review agents change provider data or read raw secrets.
- Copy BettaView into DEOS as a second workflow system or another full portal.
- Turn on, deploy, or change the live planning flow during the planning gates.

## Capabilities

### New Capabilities

- `openspec-traceability-review`: Checks one private draft before publication. Later, it checks one exact pull request version. Rechecks cover only known findings.
- `traceability-review-evidence`: Keeps the plan ID, proof, sources, tests, and past findings. It shows whether proof for a draft or pull request version is current or stale.
- `traceability-review-portal`: Shows the exact plan version, its proof, open findings, and stale state behind a login.

### Modified Capabilities

- `simplified-planning-workflow`: Keeps the first draft private until its check passes. It publishes one pull request, checks that exact version, and starts a new check round after human feedback.
- `sandbox-agent-execution`: Stores the fixed model settings. It allows read-only review jobs and clear results.
- `provider-capability-access`: Review agents can only read. Trusted steps own pull request changes, checks, and Linear links.
- `workflow-state`: Adds review rounds, repair limits, and stop states. Human Review starts only when the current pull request version has passed.
- `workflow-observability`: Links safe records by phase, mode, round, plan, finding, and pull request version.

## Impact

- Changes the planning flow, saved state, review job format, result format, and proof collection.
- Adds saved review proof and lookup records. Trusted steps report the result to GitHub and Linear.
- Adds a trace view that needs a login. It uses one fixed BettaView review tool version and its display patterns.
- Uses the finished simple-flow proof only as a starting point. Completion needs a fresh provider-originated Linear run through both checks and repair. It must prove exact versions, saved records, stale handling, a new human feedback round, GitHub and Linear links, Sandbox cleanup, and portal views. It also needs visual proof of the new provider and portal state.
- Runtime code and prompts stay out of proposal, specification, and design pull requests.
