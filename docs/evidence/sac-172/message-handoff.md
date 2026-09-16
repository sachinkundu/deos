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

- Repository suite: 556 passed, including publication-only retry coverage.
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

The calculator is not at human PR review yet. GitHub App permission approval is
pending. No implementation PR for SAC-172 has been opened.

## Activation

Initial simplification source commit: 4fa42ab. Compact summaries: 3d6cc56.

- Backend a875db5d-aa0e-4dac-a3b7-f63d6637bde7: 100% traffic.
- Staging portal e3294ce2-d29e-45c5-8bf4-ffe6220ce3e9: 100% traffic.
- Target container image: sha256:062e5dec9a2d502449a8ccddce62f718be94fc8e16cf5be2642cf308b6456445.
- All four container rollouts completed; each reports four healthy instances,
  no failed instances and the target image at 100 percent.
- Staging Wrangler exited after a route-list permission error. Deployment
  read-back confirms activation; no route or token change was made.
- The original frozen SAC-225 definition remains v33. No agent was restarted,
  human gate advanced, or calculator code changed by the supervisor.

Live authenticated staging browser inspection shows Author complete with 25/25
tasks, Claude's original findings, Prepare PR failed, and Human Review upcoming.
The demo summaries show three-line previews and expand on the node button.

## Publication recovery

Commit 40d2e48 extends the existing audited publication retry to implementation
branch writes and PR publication. It preserves the saved candidate and frozen
definition and resumes the failed publication visit. It does not start an agent,
change a human gate or judge the work. The new retry cases and the full backend
and portal suites passed. Actual GitHub publication remains blocked on the App's
Workflows permission; no retry has been requested while that is unresolved.

Publication-retry activation read-back: backend
77179dcf-0672-422a-b2cd-ab2d8a3af76f and staging portal
1f6a3e3c-5761-4d50-8d5b-062c44c756f2 both at 100 percent. The live staging UI
offers Retry Preparing implementation review. The retry has not been invoked.

The user questioned the need for GitHub Actions. Reading the saved candidate
shows that Sol added pages-preview.yml to run tests, deploy to Cloudflare Pages
using GitHub environment secrets, and upload review evidence. This is additional
CI infrastructure, separate from the DEOS state machine. Permissions remain
unchanged. The recommendation is to have Sol remove the extra pipeline; the
supervisor has not changed the calculator candidate or started another agent.
