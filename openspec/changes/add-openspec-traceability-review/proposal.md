## Why

The first simple planning run worked. DEOS made a plan, revised it, and merged it. Yet a person saw the plan before another agent checked its meaning. We want that check first. It should find gaps early and save human review for a plan that is ready.

## What Changes

- Keep a plan private while the Codex self-check can still repair it. Publish after it passes or its three-turn repair limit is used, with unresolved findings clearly marked.
- Give the self-check fresh context. Run it through Codex with the same saved model and thought level as the author coding agent. Use the fixed review prompt and a read-only tool and permission profile. Limit repairs. Rechecks cover only the self-check findings. A repair can change only the exact cited ranges tied to those findings. Keep all other plan text byte-for-byte. Recheck each changed range, its full blocks, and all two-way links. Any new defect caused by the repair keeps that finding open.
- Finish every form, structure, and readability check inside the author attempt before a semantic check. The trusted supervisor runs the checks and reports exact failures. It resumes the same Codex session in the same Sandbox when the wording or plan form needs repair. A deterministic repair does not start another workflow visit, Sandbox, or semantic repair turn. Trusted Worker code repeats the checks after exit. A mismatch stops as a tooling fault instead of starting another author loop. Do not change plan text after a semantic pass.
- Give each semantic check one exact input ID. It covers the reviewed file hashes, source list, finding set, model settings, prompt, and tool version. Reuse an accepted result when that ID has not changed. Do not start another Sandbox, spend another review try, or call the model again. If only the pull request commit changes, reuse the result only after a trusted step proves that every reviewed file and hash is unchanged.
- Close a review phase when its current findings are all fixed. Reuse that result for the same input. If reviewed bytes change, mark the old result stale and open the needed recheck. If the self-check reverses one of its own fixed ratings without a matching source change, stop that automated loop and show the conflict to a person. A different view from the independent reviewer is allowed and becomes part of its own finding set.
- Make each full semantic review ask two separate questions against the same exact files. One fresh model pass maps proposal statements to requirements. Another fresh pass maps requirements to proposal statements. Keep both claim sets. Mark matching claims as confirmed and one-sided claims as disputed. A disputed claim is review information, not malformed proof.
- Open one planning pull request after the self-check passes or uses its repair limit. Run the independent review through the same Codex coding-agent harness, but configure that harness with an OpenRouter model chosen in the DEOS settings page. Save the harness, provider, and model with the run so a settings change cannot alter active work. Send the complete independent review to the author coding agent Codex. Let the author apply or decline each concern and record why. Update the same pull request, then release it for human review. Do not fail or repeat the independent review merely because it found concerns or one-sided links.
- Keep the current plan rules for file order, full repo paths, and blocked later work. Rebuild each new job from saved facts. Keep the same pull request for changes. Reply to each changed human review thread and leave it open.
- Keep a separate limit for repair of malformed or unsafe review output. Those tries do not count as author coding agent Codex repairs and cannot change plan text or findings. A valid one-sided semantic link does not use this repair path.
- Keep safe output from every ended review job. Save its model proof, source list, hashes, raw result, clean result, sidecar, tests, findings, fixes, chat log, receipts, and safe job result. Mark missing or unsafe output.
- Use one direct saved lookup for each review so the portal does not scan file storage.
- Bind the self-check to one exact draft. Bind the independent check to one exact pull request version. Show both cycles in a view that needs a login. Link that view from the `Create Planning PR` node popup. Clearly mark each check current or stale. Keep GitHub and Linear notes short. Link them to this view.
- Start a new review round when a person asks for a change to the plan. A person must still make the approval choice.
- Let review agents read but not write. Trusted workflow steps can open or update the pull request, post its check, and add its Linear link.
- Run each review in a new DEOS Sandbox. Pin one BettaView review tool version. DEOS owns the workflow and saved proof. It also owns login and provider changes.
- Link safe review events by phase, mode, round, plan, finding, pull request head, job, model, tool, file list, and provider task.
- Set a firm attempt limit for each review stage. Count blocked and failed retries. Also limit each job. The private self-check may use up to three plan repair turns. The independent stage completes after one valid two-pass review and one author response. Then ask for human approval and show every finding, disputed link, and author disposition. A missing plan, failed deterministic check, unsafe input, or missing proof still blocks the gate.

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
- `traceability-review-portal`: Lets an operator choose the OpenRouter model. It also shows the exact plan version, proof, open findings, and stale state behind a login.

### Modified Capabilities

- `simplified-planning-workflow`: Keeps the first draft private while self-check repair turns remain. It publishes one pull request, checks that exact version, and starts a new round after human feedback.
- `sandbox-agent-execution`: Stores the saved review harness, provider, and model settings. It allows read-only Codex review jobs backed by either the saved OpenAI or OpenRouter model provider.
- `provider-capability-access`: Review agents can only read. Trusted steps own pull request changes, checks, and Linear links.
- `workflow-state`: Adds review rounds, a three-turn self-check repair limit, external completion states, and human-escalation states.
- `workflow-observability`: Links safe records by phase, mode, round, plan, finding, and pull request version.

## Impact

- Changes the planning flow, saved state, review job format, result format, and proof collection.
- Replaces the direct OpenRouter completion call with a pinned Codex coding-agent process and a capability-scoped DEOS Responses proxy that keeps the raw OpenRouter key outside the Sandbox.
- Adds saved review proof and lookup records. Trusted steps report the result to GitHub and Linear.
- Adds a trace view that needs a login. It uses one fixed BettaView review tool version and its display patterns.
- Uses the finished simple-flow proof only as a starting point. Completion needs a fresh Linear run from the real provider. The run must cover both checks and a repair. It must prove exact versions, saved records, stale handling, a new human round, provider links, Sandbox cleanup, and portal views. It also needs visual proof of the new provider and portal state.
- Runtime code and prompts stay out of proposal, specification, and design pull requests.
