# SAC-151 OpenRouter retry hotfix

Branch: `codex/sac-151-openrouter-retry`, based on SAC-151 implementation commit `a780340`.

OpenRouter model calls now allow the initial request plus three retries for transport failures and HTTP 408, 429, 500, 502, 503, 504, 524, and 529. Delays start at 2, 4, and 8 seconds, each with up to one second of jitter. A valid Retry-After duration or HTTP date can extend the delay. Authentication, payment, invalid-request, malformed-output, and partial-stream failures are not replayed by this loop.

The retry count belongs to the model request, not an author/reviewer round or a new workflow attempt. Model, provider pinning, prompts, review rules, and human gates are unchanged. OpenRouter's Codex provider disables its own HTTP and stream retries, so it cannot multiply the proxy's three retries. Retry logs record attempt counts and waits. The final protected diagnostic keeps the original provider error and total request attempts. Ambiguous transport errors remain marked as possibly accepted by the provider; repeated generation can incur charges.

## Validation

- 355 Node tests passed; TypeScript checking passed.
- Tests cover third-retry recovery, exact exhaustion, unchanged request contents, seconds/date Retry-After, invalid Retry-After fallback, jitter, permanent errors, ambiguous transport failures, and refusal to replay a partial stream.
- The isolated retry probe injects three synthetic 429 responses, uses real backoff, then sends the fourth request to the real Baidu DeepSeek endpoint through the production adapter. It validates the returned schema and exact result. It does not launch a workflow. The first three errors are synthetic, not provider-originated 429 proof.

```jsonl
{"event":"deos.openrouter.retry_scheduled","endpoint":"responses","failedAttempt":1,"nextAttempt":2,"maximumAttempts":4,"delayMs":2693,"httpStatus":429,"failureStage":"http","requestMayHaveSucceeded":false}
{"event":"deos.openrouter.retry_scheduled","endpoint":"responses","failedAttempt":2,"nextAttempt":3,"maximumAttempts":4,"delayMs":4457,"httpStatus":429,"failureStage":"http","requestMayHaveSucceeded":false}
{"event":"deos.openrouter.retry_scheduled","endpoint":"responses","failedAttempt":3,"nextAttempt":4,"maximumAttempts":4,"delayMs":8747,"httpStatus":429,"failureStage":"http","requestMayHaveSucceeded":false}
{"event":"deos.openrouter.retry_succeeded","endpoint":"responses","requestAttempts":4}
{"result":"passed","synthetic429s":3,"requestAttempts":4,"realProviderRequests":1,"elapsedMs":19294,"providerRequestId":"gen-1789037851-vafPkrASYmB4tsjn6rP8","exactSchemaResult":true,"workflowStarted":false}
```

A separate existing Codex tool-contract probe reached the provider and completed a response, but failed its expected-tool-call assertion: the model returned without the requested tool call. That probe is not counted as passing evidence. The first retry-specific probe also initially parsed reasoning content as answer text; the probe was corrected to read only message output and rerun successfully. Neither observation was used to weaken production validation.

Deployment and the resumed canary remain separate evidence to collect after merging this hotfix into SAC-151.
