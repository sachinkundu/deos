## Why

Each OpenSpec self-check now starts a new Sandbox. A later author job must then rebuild its work and context. This adds delay. A fresh review subagent can check the draft while the author stays active.

## What Changes

- Run each plan and design self-check in the active author's Sandbox. Use a fresh review subagent with its own ID and the author's attempt ID. Do not start a new Sandbox or top-level attempt. Keep all current rules for top-level attempt IDs, repo state, revisions, retries, links, and isolation.
- Start one plan author attempt. Have it write and check the proposal first, then every needed delta spec. Keep its session active for the check, fix, and recheck loop. Let it send the complete plan to the reviewer. Return findings to that same work session, where only the author may fix the draft.
- Give each review subagent fresh context. Give it the same full change input, role, model settings, prompt, result rules, and tools as the current check job. Do not give it the author's chat, hidden state, or unsaved notes. If this isolation cannot be proved, reject the result and do not move the loop on.
- Keep each reviewer read-only and block provider writes. Before and after each review, record the same tracked paths and hashes. Reject a result if a file changed or the reviewer sought provider access, and save the fault.
- Keep the same review rules and limits. Keep the same recheck rules and stop results. The new location must not add turns or change when the loop stops. A rejected file check must not use a review turn.
- Save the final review result and its proof with the author attempt. Link the input, subagent, findings, stop result, and file checks. Check the saved proof before cleanup. If that check fails, reject the attempt and keep the Sandbox for proof repair.
- After an allowed self-check stop, let the trusted step post the checked proposal and full spec set to one run branch and pull request. Use full repo paths. Use paths from the change folder in review order text. Save the provider receipt. Do not post, report success, or open human review if the plan, check, proof, or receipt is missing or bad. Then run independent review in a separate fresh stage. Keep human approval as a later and separate choice.

### Non-goals

- Do not move independent review into the author Sandbox.
- Do not let the plan author create design, tasks, or app code; change Linear state; use providers; or post, approve, or merge the pull request. Do not let a self-check approve a human gate.
- Do not change the current rules, limits, pass results, judgment results, or stop results of the planning and design review tests.

## Capabilities

### New Capabilities

- `in-sandbox-openspec-self-review`: Runs fresh and read-only plan and design checks while the author stays active. It also saves each checked result.

### Modified Capabilities

- `sandbox-agent-execution`: Lets an author attempt host a set of review subagents. It does not treat them as new top-level attempts.
- `simplified-planning-workflow`: Keeps the plan author active through its private self-check loop before the trusted post.

## Impact

The change affects Sandbox and Codex session control. It also affects plan and design checks, file checks, flow nodes, saved proof, cleanup, and tests. It does not change the outside reviewer, provider writes, or human gate rights.
