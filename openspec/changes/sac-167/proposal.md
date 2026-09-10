## Why

External review now uses OpenRouter and adds a separate charge. Claude Pro can run this work within the plan that the team already uses. The flow needs a safe cutover that keeps all review and human gate rules.

## What Changes

- Use Claude Opus 5 with high reasoning effort for each new external plan and design review. Pin these facts to the run.
- Sign in with a protected Claude Pro account. Save proof that API billing and paid credits stayed off. Do not use OpenRouter or another paid route.
- Change only the outside model route and its proof. Keep each review's exact files and head, full context, prompt, read-only tools, result shape, proof and stale checks, rounds, retries, stop rules, author response, and human gates.
- Stop with a clear failed or blocked result when sign-in has expired, the plan limit is met, or the review fails. Such a result cannot count as a passed review.
- Save proof from a real review in the deployed flow. Tie it to the exact input. Show the model, effort, result, Pro billing source, and that paid use stayed off. Include a safe data read-back and clear screen images of the provider state and review state. A mock or direct test is not enough. Keep sign-in data inside a trusted auth boundary. Do not put it in review input or proof.
- Keep each active run on its frozen flow. Apply the Claude setup only to runs that select the new flow version.
- Remove the OpenRouter model choice from the setup for new external reviews. Keep old provider data only where an older frozen run or audit record still needs it.

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
