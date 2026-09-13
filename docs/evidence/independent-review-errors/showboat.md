# SAC-172 independent review error preservation

*2026-09-13T10:56:59Z by Showboat 0.6.1*
<!-- showboat-id: bdbc3e4d-f7f0-487b-a580-674a3a3ff497 -->

```bash
rtk proxy python3 docs/evidence/independent-review-errors/readback.py --env-file /Users/sachin/code/deos/.env
```

```output
{
  "evidence": "live D1 and R2 readback of the original failed attempt",
  "issue": "SAC-172",
  "time": "2026-09-13T10:17:34.687Z",
  "message": "Claude runner stopped without a result or failure file",
  "detail": {
    "stack": "ClaudeReviewError: review_failure\n    at ClaudeRunner.status (queue-consumer.js:8306:29)\n    at async ClaudeRunner.handle (queue-consumer.js:8177:45)\n    at async queue-consumer.js:113:16",
    "message": "review_failure",
    "causeCode": "review_failure",
    "retryNotBefore": null,
    "name": "ClaudeReviewError",
    "diagnostic": {
      "providerMessage": "Claude runner stopped without a result or failure file",
      "processId": "eaeda186-2076-4406-8834-07c40de2283f",
      "output": {
        "stdout": "",
        "stderr": "",
        "exitCode": 1,
        "signal": {
          "type": "undefined"
        },
        "timedOut": false,
        "truncated": false
      }
    }
  }
}
```

The preceding entry is a live read of the original failed attempt. The following probe exercises the changed runner in a locally built image with networking disabled; it is not provider E2E evidence.

```bash
rtk proxy docker create --rm --name deos-independent-error-proof --platform linux/amd64 --network none --memory 1g --entrypoint node deos-review-errors:local /tmp/probe-image.mjs
rtk proxy docker cp docs/evidence/independent-review-errors/probe-image.mjs deos-independent-error-proof:/tmp/probe-image.mjs
rtk proxy docker start -a deos-independent-error-proof
```

```output
18835754caa40a91eb24e25cc0379e130e48d7bb776752ef7eb96d2d679b05b7
{
  "evidence": "local built image, real runner process, network disabled",
  "exitCode": 1,
  "cause": "Claude runner config.json is missing",
  "fileMatchesStderr": true,
  "originalStackRetained": true
}
```
