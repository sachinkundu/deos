# Preserve Claude provider errors

The September 12 SAC-170 review failed at 07:37 UTC. The trusted runner saved
`auth_failure` and diagnostic flags, but discarded Claude's response and stderr.
The receipt validator classifies a 401 or 403 response as `auth_failure`. The
saved evidence cannot distinguish those responses or explain the rejection.

The repair captures the provider events, stdout, stderr, original exception,
stack, causes, HTTP status, and operation context. Credential values are
redacted. Error text is not shortened. Success receipts and public error codes
keep their existing contract.

The Worker stores the full failure in protected R2 and the provider's original
message in D1. If the failure file cannot be written, the runner emits the
original failure and the storage error on stderr. The Worker collects that
fallback before cleanup. Repository-tool HTTP failures retain response bodies,
headers, and request context. Shared object references no longer lose their
contents during error serialization.

## Validation

- Backend suite: 385 tests passed.
- TypeScript typecheck passed.
- Local subprocess regression tests cover 401, 403, malformed provider output,
  process exit, executable lookup failure, broker failure, and failure-file
  write errors. They check full multiline messages, nested details, stacks,
  large stderr, and credential redaction.
- A local subprocess-to-Worker-to-SQLite/R2-double check verifies the D1 message
  and protected error object, including the stderr fallback.
- A local HTTP server checks that repository-tool response details survive.

These regression checks use local processes and doubles. They do not prove that
a live provider failure retains its full details.

## Production rollout and retry, September 12

SAC-161 returned to Human Review at 10:41:51 UTC. D1 confirmed `awaiting_human`
at `design_review`, and no agent attempts were active on the shared backend.
The tested `c92b299` backend was then deployed. Neither portal was deployed.

Readback confirmed Worker `950ee474-71e3-4c7b-846b-6a9ebdbc9695` at 100% traffic.
The gradual container rollout completed with all four instances healthy and
image digest `sha256:6bc24d6915d87e32ab9e02327b262e06517bc465c2bd4aaf007d24988a4b8623`.

At 10:48:54 UTC the supported stage-retry endpoint accepted one retry of
SAC-170's failed `design_independent_review` attempt. It retained the existing
business run and frozen workflow definition v24. The new attempt is
`01a0953c-1dc9-7ce3-a0e4-bd855eec623e`; its Cloudflare Workflow instance is
`wf-v1-pf4sw62lp3yovir734yl3e4mktmd2d7ssjgzv3svalwurdmoj6qq`.
Claude finished the review with concerns. Its invocation has no failure cause,
and its runtime was destroyed after collection. The author response attempt
`01a09541-25d7-78b5-a8a6-f15b95d4cf75` then completed and was cleaned up.

Linear entered Human Review at 11:06:04 UTC. D1 confirmed `awaiting_human` at
`design_review` at 11:06:20 UTC. Cloudflare reached the human-event wait for
visit 40. SAC-161 remains at its Human Review gate. No further retry or human
approval was issued, and the monitor was paused after recording this outcome.

This live retry confirms a real Claude review and author response can finish
on the deployed release. No authentication failure recurred, so it does not
identify the original rejection cause or prove the new failure capture path
against a live rejected request.

## Live failure capture after the next revision

The next human-requested design revision completed, but its Claude review
attempt `01a0955b-9167-7cc9-97d1-7420f3d6d0d5` failed on September 12 at
11:23:47 UTC. The deployed diagnostics retained the exact client message:

> Failed to authenticate. API Error: 403 Request not allowed

D1 saved that message at 11:23:50 UTC under error
`11dba3b1-ef9d-480e-a8f8-fc2a3f360f96`. Its protected R2 object is 7,678 bytes.
It retains status 403, all three provider events, the full 2,929-character
stdout stream, the original exception and stack, and the attempt context.
Stderr was empty. The terminal event reports zero input and output tokens.
This is real provider failure capture through the deployed runner and Worker.
The later timeout and missing output files are secondary failures.

SAC-161's overlapping review completed with the same recorded account binding
and credential version. This evidence does not identify why this particular
request was rejected, and it does not establish a permanently invalid token.

After the user requested investigation and follow-through, the stopped and
cleaned-up stage was retried once at 11:39:16 UTC. The supported operation kept
the existing business run and frozen v24 definition, advancing visit 45 to 46.
The new Workflow instance is
`wf-v1-rntenp5gkgagwmkc6othboimueh64mzscaedlrhhcekprce22amq`.
No credentials, human gates, or deployments were changed. The new review attempt
`01a0956a-3a29-778f-aa53-4b186d7d5aca` is running; the result is pending.
[Showboat follow-through](provider-403-followthrough.md) records this retry.

[Showboat deployment and retry output](provider-rollout.md) records the actual
commands and remote readback. Its operator helpers and request file were saved
under `/tmp` for this run; the mutation commands must not be replayed as checks.
