# Storage canary supervision

Issue: [SAC-246 — Keep a small shelf of text snippets](https://linear.app/sachinkundu/issue/SAC-246/keep-a-small-shelf-of-text-snippets).
Issue UUID: e08fdf64-e2dc-42d5-b7e6-ab0a11607241.
Project: 99426d9b-cda7-4db4-9136-692a95a0b090.
Expected run: workflow:99426d9b-cda7-4db4-9136-692a95a0b090:e08fdf64-e2dc-42d5-b7e6-ab0a11607241:run:1. Verify in D1.

Sachin authorized automatic prerequisite proposal/specification and design gates,
routine answers on his behalf, safe workflow fixes and a prospective failure log.
Cloudflare agents alone write the canary app, its tests and its demonstrations.
Do not finish their work locally. No local subagents or memory writes. Stop at
the implementation PR, unmerged and unreleased. Do not resume SAC-245 or SAC-182.

Work in /Users/sachin/code/deos-sac-172 on codex/temporary-cloudflare-environments.
Read AGENTS.md, docs/implementation-canary-lessons.md and the failure register.
Prefix shell commands with rtk. Keep credentials in ignored .env or private /tmp
files; never print or commit them. The previous validated baseline is on main
through DEOS PR138. Extension PR139 is draft pending this canary's real evidence.

Scope: one desktop snippet shelf with title and plain text. Save, list, read and
delete. Use real D1 for metadata and real R2 for text, through the trusted
temporary-environment-v1 capability. No authentication, sharing, rich text,
search, file uploads or production release. Reasonable routine limits are an
80-character title and a 4-KiB body; the agents may choose equivalent simple
limits. A fresh browser must see saved data. Deletion must remove both records
and objects. Fresh browser contexts do not reset shared storage; agents own
fixture reset. Do not substitute emulated storage or the local adapter fixture
for canary proof.

Preflight after registry repair: backend 5a65c8a2-da87-4cc5-8539-5e7b2a37cc96 at 100%; all four runner
pools healthy on image 48e32b0bf878bb7545d73d1d51754134b17f7772fe4a598f82ac45cd5a540bb2.
Migration0053 applied. New frozen implementation definition is v41; v40 was
already used for a previous custom test profile. RouteAdmin selected and
registered v41, then enabled dispatch at13:37:01UTC, route revision29.
Never edit workflow D1 records manually.

RUN STARTED: genuine Linear Todo transition13:37:18.201UTC, delivery
191ed8b3-0611-4036-99fd-9b67a924d2f9 received13:37:19.397. Run1 created13:37:26.619,
frozen v41 digest79533f9d41a29bc8b422b5594fc6bcde5de4546c9718f73dd56557810ac6d53f,
workflow wf-v1-4wvaym3kaom5m6ieeotnkmaihqshyy76jgh5hwkigmwkgkhkijgq.
Planning author01a0af96-705a-77f2-85ab-cd28486c6450 running since13:37:47.529.
Do not start another run or resend Todo. No canary workflow errors observed yet.
The registration failure before launch is repaired and logged separately in
the extension evidence. Check the next scheduled cycle registers the other new
traceability variants26/27 without digest errors; do not deploy during active
author work. Existing run definitions remain unchanged.

13:38:54UTC live reader confirms the author understands this is the remote
Worker/D1 metadata/R2 text path. Native process started13:37:59.257; no D1 errors.
Full private snapshot /tmp/sac246-reader/2026-09-17T13-38-54.579Z.json retained.
The temporary RouteAdmin helper has been stopped; the read-only reader remains
active on8806 (exec session66526). Heartbeat supervision is active every5minutes.

Read authoritative state with:
`rtk proxy python3 docs/evidence/sac-172/storage-canary/readback.py`.
It saves timestamped snapshots and latest.json, including owned environment rows.
Collect completed artifacts with collect-artifacts.py in the same directory;
full hash-verified private files go to /tmp/sac246-artifacts.

Live read-only reader: /tmp/sac246-reader/read.py, port8806, inspector9306.
Start it, if needed, using:
`rtk proxy python3 /tmp/sac172-operator-command.py npx wrangler dev --config /tmp/sac246-reader/wrangler.json --remote --port 8806 --inspector-port 9306 --show-interactive-dev-session=false`.
It expires 2026-09-18T09:30Z. Never print token.json. It reads cloud files/process
state and cannot execute or modify the author. Stop the reader at completion.
Audit full snapshots and completed artifacts, not only the printed transcript tail.

Inspect actual proposal/spec and design PR diffs, including later review fixes,
before approving each prerequisite gate. Use an authorized concise Linear
approval comment and Merging transition, then verify consumed provider delivery
and GitHub merge. Answer routine questions within this scope. Do not advance
the final implementation gate. Approval is a normal authorized action, not a
failure recovery. Claude plans and reviews once; Sol implements and responds once.

Track every observed failure, including recovered command exits, with original
message, stage, cause or uncertainty, recovery, owner and evidence. Keep quality
findings and expected negative tests distinct. At completion report sections for
automatically fixed, fixed by supervisor and still needing work. A clean D1
error table is not evidence of zero author errors. Explicitly observe task-tool
adoption and incremental checklist timestamps; never invent intermediate counts.

Use supported same-stage retries with saved work. Deploy backend, secrets or
container fixes only after current D1 confirms no pending/starting/running/
collecting attempts anywhere. Read back Worker traffic and every container pool.
Original errors and cleanup failures must survive recovery. Do not retry an
ambiguous app write. App repair must go back through the Cloudflare author.

At implementation PR completion, inspect actual screenshots in connected Brave,
check published image links without tokens, audit real D1/R2 proof and the PR
candidate, and confirm all temporary Workers, D1 databases and R2 buckets are
absent. The service publishes proof to GitHub before teardown. No live preview
is expected afterward; screenshots and Showboat remain available. Do not delete
DEOS shared storage or evidence. If cleanup fails, retain identities and error
records and use ownership-checked reconciliation.

Commit/push only sanitized intended evidence on the extension branch. Update
PR139 with the real canary result and any limitations. Stay quiet on routine or
unchanged states; notify on completion or substantive problems. Pause heartbeat
run-reading-queue-canary-to-pr at completion. Leave both implementation PRs
unmerged for review unless the user gives further instructions.
