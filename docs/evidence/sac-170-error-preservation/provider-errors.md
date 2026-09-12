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

These are local regression checks, not a new provider-originated workflow run.
The patch has not been deployed. Production readback still showed Worker version
`e4985e63-03ad-44cb-9b3e-d5cb5d2a874a` at 100% and three active workflow records.
No SAC-170 retry or workflow-state change was made.
