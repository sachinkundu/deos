# SAC-182 preservation and shared test preflight

Read-only remote checks on 28 September 2026 found the following:

- SAC-182 run 1 is still recorded in D1 as `awaiting_human` at
  `implementation_clarification_wait`, visit 91, frozen to implementation
  workflow v43. Its Cloudflare Workflow instance
  `wf-v1-vqzpfkxblyxv7doghzlwfesrcucbrrg2zorypo4jgc7zjorpqreq` is
  `errored`, with `Execution timed out after 86400000ms`.
- D1 already preserved that original runtime error in `workflow_errors` as
  `4134ad39-6618-4ff7-921e-382f0b18d582`, at
  `src/deos-workflow.ts:81`, observed 21 September 2026 15:38:11 UTC.
- No agent attempt is pending, starting, running, or collecting. The shared
  test site is free with no owner and fence 0. Implementation workflow v44 is
  registered. The DEOS project route still selects simple-traceability v26.
- [PR #137](https://github.com/sachinkundu/deos/pull/137) remains open, with
  changes requested. Branch `deos/agent/SAC-182/run-1` points to
  `e04d76cbe32f72c9390c95b6ef33623ddfa2db26`. D1 retains the run's
  cumulative patch SHA-256
  `fae9ce85980de02b283cfb522bdf548f0997fa86e2883e0c20bc732e82558e4e`.
  Neither the PR nor branch has been closed or rewritten.

The 24-hour human gate wait previously let an expected checkpoint timeout
escape and leave D1 active after the executor errored. The implementation PR
now catches only the recognized `WorkflowTimeoutError`, then rechecks the
same durable gate. Unexpected wait failures still retain their original cause.
This fix protects new runs; it cannot change the frozen v43 instance. The
old run needs an explicit terminal reconciliation against the saved error
before a v44 run for the same issue can be admitted. Any new run must reuse
the existing code and re-prove it through the new shared test node.
