# SAC-246 sandbox-local browser repeat: final analysis

The implementation-only repeat reached Human Review at09:11:11UTC on18September.
[Sample PR45](https://github.com/sachinkundu/deos-sample-project/pull/45) remains
open, unmerged and unreleased. Its head108d02af273ace38d379ca1f94012a76dadefe31 is
unchanged: this repeat repaired demonstration evidence, not sample application
code. Approved proposalPR43, designPR44 and saved demo plan were preserved.

## Automatically recovered or completed

The cloud author reran a transient local test-adapter failure without a source
change; all16tests and the build passed. A1042temporary Worker health check
recovered on a repeat publication to the same owned resources. The agent removed
an unsupported R2listing field, reduced an oversized demo request, corrected a
status CLI invocation, and continued after blocked native patch calls and invalid
task transitions. The final response corrected two unsuitable failure fixtures
and split a rejected multi-SELECT inspection into two supported reads.

Chromium inside the actual Cloudflare sandbox rendered the loopback app and
navigated to the owned HTTPS Worker with real D1/R2. The main-flow collection
completed7scenarios/11images, including real100object capacity rejection and
fresh-context persistence. Its loopback image honestly shows an uninitialized
local-storage error; it proves rendering, not successful local storage.

The browser-runtime identity guard forced a new independent review. That reviewer
inspected all11images and raw storage proof, accepted those as real, and returned
needs_work for missing failed-read/delete demonstrations. Normal routing started
an author response. After the supervised capacity retry described below, that
author supplied3unique selected images of real deployed error handling using a
clearly labeled synthetic inconsistent-index fixture. They are not evidence of
a spontaneous provider outage. The fixed policy gives one author response and
then Human Review; no second independent pass is claimed.

Both owned temporary Worker/D1/R2 sets were automatically destroyed: the first
on terminal failure, the second after publication. Independent Cloudflare API
readback returned resource-specific404absence for all6resources. Browser closures
and all sandbox cleanup states are recorded. Public PR45 images return200without
authentication and match their recorded SHA256hashes.

## Fixed or recovered by the supervisor

Before the repeat, the supervisor implemented the local-browser runtime and
fixed unsafe redirect interception exposed by the Linux regression. Adding
Chromium initially exceeded the basic pool disk limit; using only headless shell
and removing package caches reduced the root filesystem from3.30GB to2.17GB.
The deployed Worker and all4container pools were verified before the canary.
The browser-runtime review identity guard prevented reuse of the earlier review.

The existing Workflow engine still held yesterday's code. Its1197step history
was archived, then the engine alone was restarted at the saved implementation
review gate. Proposal/design and prior agent stages did not rerun.

The first author response stopped on `Selected model is at capacity`. Its failure
snapshot and originals were preserved, but there was no automatic stage retry.
After verifying cleanup and zero active attempts, the supervisor used one
supported same-definition/same-model retry. It resumed saved implementation and
feedback. This is supervised recovery, not an unattended success.

Final publication selected only the3new error-path images, omitting the11earlier
main-flow images from the PR gallery. The supervisor retained and hash-verified
those earlier images and attached a [commit-pinned evidence supplement](https://github.com/sachinkundu/deos-sample-project/pull/45#issuecomment-5727967312) toPR45.
This repairs reviewer access without editing the sample app. The automated
publication-selection behavior still needs repair.

No sample implementation code was edited by the supervisor. The separate retry
policy fix is draft[DEOS PR141](https://github.com/sachinkundu/deos/pull/141); it is
not part of this deployed canary. It passed630tests,1existing skip, typecheck and
a local real-supervisor fault-injection test, not live provider recovery proof.

## Still needs fixing

- External-service retries are incomplete. PR141 prepares same-session Codex
  retries; Claude continuation, retry-after handling and other provider boundaries
  still need the audit in docs/external-service-retry-policy.md on that branch.
- Earlier accepted proof can disappear from the final PR gallery when an author
  response selects only the added evidence. Supplementary publication was manual.
- An atomic demo cannot interleave queued storage operations. The agent wasted
  one collection trying that. Document it clearly or provide a safe fixture step.
- Repeated native tool, CLI, task-transition and request-shape mistakes show that
  instructions alone do not fully prevent known misuse. Improve contracts/errors.
- The intermittent local Miniflare/workerd assertion and repeated1042readiness
  symptom recovered; their precise causes remain unknown.
- Completed-author progress timeout retention remains incompletely verified.
  The normal manifest lacks original-errors.jsonl; completion diagnostics may be
  copied separately, but this timeout was preserved by live supervision. Do not
  claim all originals survive unattended completion.
- The failing reader clears old content but retains its loading placeholder.
  This UI limitation was logged without expanding a workflow trial into polish.
- The old external preview relay530/1016was bypassed by replacing the browser
  architecture. The relay service itself was not repaired.

## Comparison with earlier runs

There are new failures, but many are repeated classes. New to this change were
Chromium image disk pressure and the atomic-demo fixture sequencing mismatch.
Known classes recurred: progress delivery timeout,1042readiness, task reopening,
oversized requests, blocked native tools, provider capacity/availability, and
incomplete evidence coverage. The final gallery omission is a newly observed
publication limitation in this repeat; do not infer it never happened before.
The adjacent UnknownProcessId error is preserved, but its relationship to model
capacity is unknown.

The improvement is concrete: loopback screenshots no longer use the failing
public relay, owned remote HTTPS works in the same browser, real D1/R2 evidence
survives infrastructure removal, and the changed browser triggered fresh review.
Reliability is not yet unattended: engine activation, one capacity retry and
final evidence supplementation required supervision. Logged LOCAL-01..15 are
failure-register entries, not a count of unique provider outages or failed runs;
repeated occurrences and expected negative tests are distinguished in failures.md.

Evidence: activation-complete.json, canary-start.json, fresh-review-result.json,
response-retry-receipt.json, completed-response-audit.json, final-provider-readback.json,
final-cloud-demo-receipt.json, response-final-demo-receipt.json and cloud-captures/.
Prior baseline: ../sac-172/storage-canary/analysis.md and failures.md.
