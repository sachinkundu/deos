# SAC-246 implementation repeat using sandbox-local Chromium

Work in /Users/sachin/code/deos-local-browser on codex/sandbox-local-browser.
Runtime change is DEOS PR140, based on the open temporary-environment PR139 branch.
Do not change the trial app locally. Cloudflare agents own all app implementation,
tests, fixes and demos. The user authorized safe workflow repairs, answering normal
questions on their behalf and automatic gates. Report only newly observed errors.
No local subagents or memory writes. Prefix shell commands with rtk.

Scope: repeat only SAC-246 implementation, retain approved proposal PR43, design
PR44, design/base412a3f46aacb3a970b2415509d91f2ba7ae3f77e and saved demo plan. Same
run workflow:99426d9b-cda7-4db4-9136-692a95a0b090:e08fdf64-e2dc-42d5-b7e6-ab0a11607241:run:1,
same app PR45. Stop unmerged and unreleased. Never resume older canaries.

Use readback.py in this directory first. It queries D1 and writes full snapshots.
The canary-request.md file contains the exact authorized instruction to be posted
to PR45 before transitioning Linear from Human Review to In Progress. Do not repeat
that transition once a receipt and running attempt exist. Verify actual consumption
and preserve frozen definition41 digest79533f9d41a29bc8b422b5594fc6bcde5de4546c9718f73dd56557810ac6d53f.

The change records browserRuntime sandbox-local-chromium-v1 in trusted candidates.
An older external-browser review no longer qualifies for handoff; this repeat must
enter the existing independent demo gate. After a new same-runtime needs_work
review, the existing frozen single-response policy returns the author response to
human review without requiring a second independent pass. Report that honestly.

Record every observed error, original cause/stack, ownership of recovery, receipt,
and outcome in failures.md. Separate supervisor development/test errors from actual
cloud canary failures, negative tests and automatic recovery. Compare actual canary
results with docs/evidence/sac-172/storage-canary/analysis.md and the reading and
expense runs. The previous 530/1016 relay failure should be avoided because local
browser preview uses loopback; verify the new agent actually captures that path.

Live read-only helper, if started: /tmp/sac246-local-browser-reader/read.py on local
port8808, remote Wrangler dev worker using existing DO bindings. It only reads the
latest active SAC-246 process, never executes author work. Source expiry13:00UTC on
2026-09-18. The helper calls getProcess before file reads so stopped sandboxes are
not intentionally restarted. Preserve all full private captures. Never print tokens.
If absent/expired, durable artifact collection remains available with
../sac-172/storage-canary/collect-artifacts.py, which verifies R2 hashes and writes
private /tmp/sac246-artifacts files. Do not mistake prior-attempt evidence for this
repeat; use attempt IDs and timestamps.

Deploy backend or containers only after fresh global D1 shows no pending, starting,
running or collecting attempts. Never manually edit workflow D1, fabricate proof,
reset an uncertain action, interrupt healthy agents or deploy another runtime over
active work. Worker100percent is not container activation; verify expected digest,
completed rollouts, healthy instances and100percent target version in all four pools.
Read-only rollout helper: /tmp/local-browser-rollout.py --env-file /Users/sachin/code/deos/.env.
Credential-safe CLI wrapper: /tmp/local-browser-command.py. Runtime deployment log:
/tmp/local-browser-deploy.log. Update activation evidence after successful readback.

Completion requires the actual changed app's local-browser captures, real remote
D1/R2 demonstrations, independent gate and any cloud-author response, PR45 update,
public durable screenshot hash checks, and confirmed deletion of every new owned
Worker/database/bucket. Keep evidence and shared resources. Confirm local browser
shutdown and sandbox cleanup; there should be no new Browser Rendering or tunnel
allocations. Preserve approved upstream hashes and gates. Keep PR140 draft until
its real canary outcome and limitations are recorded; update its body and evidence.
Commit and push only this runtime branch, leaving app merges/releases untouched.

The existing heartbeat run-reading-queue-canary-to-pr should supervise this repeat
once started. Pause it at verified completion. Do not send routine progress or
success notifications; save the final grouped analysis and links in these files.

Runtime source commit1a8807c. Worker versiona21b912f-fa3b-46d0-89fe-0561dae63943.
Expected container image digest2cc00971202b0b53cc926467277cdb3dcc95ffb27cdd00372e411a6fef09673b.
Upload completed; require all pool rollout readbacks before the Linear transition.
