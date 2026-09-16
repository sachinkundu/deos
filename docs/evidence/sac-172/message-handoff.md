# Implementation message handoff — 16 September 2026

Sol implements and demonstrates the work. Claude reviews once. If Claude returns
findings, Sol responds once, then the workflow publishes for human review. The
workflow does not assess that response or generate repair instructions.

Removed completion gates: task completeness, command exit codes, required proof
kinds, evidence revision matching, documentation citation ledgers, demo coverage
and reviewer result identity. The old verify endpoint acknowledges frozen jobs.
Actual command results and evidence remain available, including failures and
prior-attempt context. The author stays active until it finishes; Claude Review
and Prepare PR display their actual workflow visits.

## Local checks

- Repository suite: 553 passed.
- Portal suite: 102 passed.
- Backend and portal type checks, generated bindings checks, strict OpenSpec
  validation, portal build and backend deployment dry-run passed.
- Linux amd64 image built successfully.
- The isolated built-container fixture completed with a real command exit 7,
  unfinished task, no demo evidence and an unused documentation sidecar. It
  retained the command result after a file edit and sent no verify request.
  This is a local runtime regression check, not provider end-to-end proof.

## Calculator canary

At 08:18 UTC, SAC-225's Sol response was saved and the author stopped. Its latest
recorded command results were successful and the saved candidate contains 39
proof items. Claude was not invoked again. Publication then failed when GitHub
POST /git/trees returned HTTP 403: Resource not accessible by integration.
The candidate includes .github/workflows/pages-preview.yml. The App installation
has contents write but does not have workflows write. The original provider
response is retained in the run's implementation diagnostics.

The calculator is not at human PR review yet. Deployment and activation results
for this simplification will be appended after read-back. No implementation PR
for SAC-172 has been opened.
