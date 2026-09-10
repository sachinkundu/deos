# SAC-151 implementation status

The proposal and design were merged in DEOS PRs 98 and 99. D1 confirms that
SAC-151 completed its planning flow on definition 22. Implementation work is
isolated on `codex/sac-151-implementation`.

## Verified native runtime contract

The executable probe in `scripts/probe-native-self-review.py` uses the pinned
Codex CLI 0.147.0 and scripted responses from a local HTTP server. It has an
empty, temporary Codex home and does not copy or refresh login credentials.
The model name selects runtime behavior; no real model is called.

The probe confirms two different child IDs under one live parent. Each child
gets the configured reviewer instructions and high reasoning setting without
the private parent prompt. The launch hook replaces a requested full-history
fork with a fresh child and the configured review packet. Both attempted shell
writes are denied before execution. The checked draft hash stays unchanged.

The runtime uses the native `multi_agent_v1` tool namespace and
`fork_context: false` with the configured model. The supported model catalog
override selects this plain-message tool interface and retains the provider model
metadata. Code-mode shell calls reach the hook as `Bash`.

Hook trust must survive child configuration loading. A parent-only hook-trust
launch override did not activate the child's hooks in the initial probe.
Reading back the exact generated hook definitions through `hooks/list` and
persisting their trust hashes activated both child start/stop and tool hooks.
Production now uses that same hook discovery and trust process. Native sessions
carry input digests, full file manifests, tool receipts, and durable acceptance
records.

See `sac-151-native-runtime.md` for executable Showboat output and
`sac-151-native-runtime.json` for the successful check results. These results
are local runtime evidence, not provider-originated or Cloudflare evidence.

## Review policy decision

The approved design says to reuse an existing design recheck adapter and an
immutable discovery finding list. Current definition 22 has no design recheck
job: `design_self_review` uses `reviewMode: discovery`, and every author repair
returns to that job. `design-review-runner.mjs` accepts discovery only.
`D1DesignReviewStore` stores each review's own findings and caps author response
turns. This is different from planning's fixed-list recheck reducer.

SAC-151 also says to preserve existing review rules, and its design says the
frozen definition is authoritative. Adding fixed-list design rechecks would
therefore change review policy as well as execution location. The user confirmed on 2026-09-10 that review rules must remain unchanged.
Preserve definition 22 design discovery and limits. Fixed-list rechecks apply
to planning only.

## Canary preparation

The earlier matching calculator example is SAC-129 in `deos-sample-project`:
basic arithmetic, Celsius/Fahrenheit conversion, and degrees/radians conversion.
At preflight, the sample route was disabled and had older unfinished runs.
Those older runs remain unchanged.

The user authorized trial review comments, requests for rework, and human-gate
transitions. After the policy decision and implementation, use a new calculator
issue and a new frozen definition. Inspect the proposal and design, request
specific revisions, verify the revised artifacts and replies, then use the
normal signed Linear transitions for the authorized trial decisions.


## Runtime integration and release progress

The native hook integration now passes inside the DEOS container image. A scripted
model drives the production hooks and design adapter through a concern, a repair,
and a second fresh reviewer pass. Both child manifests stay unchanged. The parent
attempt stays the same. This is local integration evidence, not provider proof.

Native author shell commands run as a separate operating-system account. That
account can edit the checkout and draft outputs, but cannot edit hook config,
session receipts, or review checkpoints. Reviewer commands use a bounded reader
for the checked source files. The native profile alone does not enforce a narrower
Sandbox policy in this pinned runtime, so the trusted hooks enforce tool access.

The additive native-session migration is applied, and workflow v23 is registered.
SAC-166 was launched through real Linear Todo events. Run 1 exposed a supervisor
syntax error, now caught by the container build. Run 2 started a native child but
exposed a transport mismatch: the v2 message argument is encrypted and cannot be
replaced with plain service-authored text by the hook. The native v1 interface
supports the required plain-message contract. Both local probes now use it.

The live child error is saved in R2. The controller now detects a terminal child
error even when no SubagentStop hook runs, and stops the parent with that cause.
Initial native authors reconcile every ten seconds; other paths keep the existing
heartbeat interval. The corrected image is active at 100% Worker traffic. SAC-166 run 3 uses a new author attempt and Sandbox on that image.
No human gate has been advanced for SAC-166 yet.

## Live planning result

Run 3 completed planning self-review in one author attempt. Two fresh native
children performed discovery. Their accepted findings led the same author to
repair its draft. A third fresh child rechecked the fixed finding list and passed.
All three proof objects matched their saved hashes and child IDs. They show fresh
context and unchanged file manifests. The author then completed and its Sandbox
was destroyed after artifact verification.

The second review exposed the old one-manifest-per-attempt database constraint.
Migration 0031 permits multiple scoped manifests under the parent attempt. It
preserves existing references; the remote foreign-key check reported no violations.
The pending workflow checkpoint replayed successfully without replacing the author.
A regression test covers two review manifests and the final author manifest.

## Remaining canary work

The published calculator proposal is sample-project PR 11. Publication recovered
through provider reconciliation. Independent review then failed on a retryable
OpenRouter HTTP 429. Its failed attempt is 01a08a5a-bdd7-734e-9586-a278fde7eaea;
the saved native planning results remain accepted.

A changes-requested review on proposal PR 11 asks for finite-number input and
result bounds. The portal's stage-retry confirmation is pending because browser
controls could not accept the JavaScript dialog. No retry was submitted at this
checkpoint. Independent review, proposal rework, design review and rework, and the
remaining authorized human transitions must complete before this PR is ready.

Repository validation: 350 Node tests, typecheck, 56 Python tests, and strict
OpenSpec validation passed. The backend Worker version is
9534de94-332b-44bf-8936-cf069412609e at 100% traffic. Container image digest is
8a97f99ff512dcd975f42eecfeffa791ca484dfe38247ed7d4f3562fa2a03736.
The portal and BettaView deployments were not changed. Local probe containers and
the temporary observer Worker were removed.
