## Why

External review now uses OpenRouter and adds a separate charge. Claude Pro can run this work within the plan that the team already uses. The flow needs a safe cutover that keeps all review and human gate rules.

## What Changes

- Use Claude Opus 5 with high reasoning effort for each new external plan and design review. Pin these facts to the run.
- Use the user's local Claude auth JSON through the trusted runner, as Codex does. Do not ask the user to sign in during the flow.
- Keep each review's exact files and head, full context, prompt, read-only tools, result shape, proof and stale checks, rounds, retries, stop rules, author response, and human gates.
- Stop with a clear failed or blocked result when local auth cannot be used, the plan limit is met, or the review fails. Show the cause only for a failed or stopped review. Such a result cannot count as a passed review. Do not try another model or provider.
- Save internal proof from a real review in the deployed flow. Tie it to the exact input, model, effort, result, and Claude Pro route. Include a safe data read-back and clear screen images of the provider setup and review state. A mock or direct test is not enough. Do not show these internal facts on a passed review. Keep the local auth JSON inside the trusted runner and out of review input and proof.
- Keep each active run on its frozen flow. Apply the Claude setup only to runs that select the new flow version.
- Remove the OpenRouter model choice from the settings portal for new external reviews. Keep old provider data only where an older frozen run or audit record still needs it.

### Non-goals

- Do not change Codex author or self-check work.
- Do not change review rules, review rounds, repair limits, stop limits, author choices, or human approval rights.

## Capabilities

### New Capabilities

- `claude-pro-external-review`: Runs each external plan and design review with Claude Opus 5, high effort, protected Pro sign-in, no paid fallback, and clear proof.

### Modified Capabilities

- `sandbox-agent-execution`: Runs the Claude reviewer with protected account data and blocks API keys or paid billing paths.
- `workflow-observability`: Shows safe proof of the review model, effort, billing source, result, and stop cause.

## Impact

This change affects the frozen flow, external review jobs, Claude sign-in storage, review dispatch, saved proof, and the protected portal. It removes OpenRouter from new external review work. Old run data stays readable. Tests must cover plan and design reviews, expired sign-in, plan limits, bad results, frozen old runs, and the no-paid-use rule. A real deployed review must prove the model, effort, result, and Pro billing source.
