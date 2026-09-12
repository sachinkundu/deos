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
Cloudflare reported the workflow running, and D1 recorded the new attempt.
The review result is pending. SAC-161 remains at its Human Review gate.

[Showboat deployment and retry output](provider-rollout.md) records the actual
commands and remote readback. Its operator helpers and request file were saved
under `/tmp` for this run; the mutation commands must not be replayed as checks.
