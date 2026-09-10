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
heartbeat interval. The corrected image is rolling out before another real trial.
No human gate has been advanced for SAC-166 yet.
