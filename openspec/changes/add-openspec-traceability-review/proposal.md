## Why

The first simple planning run worked. DEOS made a plan, revised it, and merged it. Yet a person saw the plan before another agent checked its meaning. We want that check first. It should find gaps early and save human review for a plan that is ready.

## What Changes

- Keep a plan private until its first review passes.
- Give the first reviewer fresh context. Match the author's saved model and thought level. These are the full author-match settings. Use the fixed review prompt and a read-only tool and permission profile for the reviewer role. Limit repairs. Rechecks cover only the first review's findings. A repair can change only the exact cited ranges tied to those findings. Keep all other plan text byte-for-byte. Recheck each changed range, its full blocks, and all two-way links. Any new defect caused by the repair keeps that finding open.
- Finish every form, structure, and readability check before a semantic check. These checks report problems but do not edit the plan. If they fail, the author repairs the plan before the semantic check starts. Do not change plan text after a semantic pass.
- Give each semantic check one exact input ID. It covers the reviewed file hashes, source list, finding set, model settings, prompt, and tool version. Reuse an accepted result when that ID has not changed. Do not start another Sandbox, spend another review try, or call the model again. If only the pull request commit changes, reuse the result only after a trusted step proves that every reviewed file and hash is unchanged.
- Close a review phase when its current findings are all fixed. A later recheck cannot silently reopen a fixed finding. It must show which changed bytes caused the new rating. Otherwise, treat the result as bad review proof. Resolve that conflict within the proof-repair limit before asking the author to change the plan.
- Open one planning pull request after the first review passes. Use a different fixed model for the second review. Repair the same pull request. After each repair, let the first model check the exact new head. Then let the second model recheck every finding in its base set before human review.
- Keep the current plan rules for file order, full repo paths, and blocked later work. Rebuild each new job from saved facts. Keep the same pull request for changes. Reply to each changed human review thread and leave it open.
- Keep a separate limit for repair of a bad sidecar or review result. Those tries do not count as author fixes and cannot change plan text or findings.
- Keep safe output from every ended review job. Save its model proof, source list and hashes, raw and clean result, sidecar, tests, findings or fixes, chat log, provider receipts, and safe job result. Mark missing or unsafe output.
- Use one direct saved lookup for each review so the portal does not scan file storage.
- Bind the first check to one exact draft. Bind the later check to one exact pull request version. Show its proof and result in a view that needs a login. Clearly mark the check current or stale. Keep GitHub and Linear notes short. Link them to this view.
- Start a new review round when a person asks for a change to the plan. A person must still make the approval choice.
- Let review agents read but not write. Trusted workflow steps can open or update the pull request, post its check, and add its Linear link.
- Run each review in a new DEOS Sandbox. Pin one BettaView review tool version. DEOS owns the workflow and saved proof. It also owns login and provider changes.
- Link safe review events by phase, mode, round, plan, finding, pull request head, job, model, tool, file list, and provider task.
- Set a firm attempt limit for each review phase, including blocked and failed retries. Also limit each job and repair loop. Stop before human review if the work fails or uses all its tries.

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
