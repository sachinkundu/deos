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

13:52UTC recovery: STORE-01 was caused by the supervisor launching during the
basic pool's second rollout. Exact provider log confirms rollout termination
at13:40:00.709. The original planning filesystem was lost; the earlier live
snapshot and durable failure manifest/error stacks remain. STORE-02 fixed the
cleanup endpoint's missing interrupted/absolute_timeout hold-release support.
Backend-only repair9c39fb05-afa9-4688-a05c-b326cfee1967 is active at100%; no new
container rollout was requested. The strengthened ready check confirms all four
latest rollouts completed and100% of instances at their target version/image.
The old interrupted sandbox was destroyed through the supported endpoint.
Same-run/same-definition planning retry established13:52:33.526, visit4,
replacement workflow wf-v1-q4rrh2j4pmk64wiaopqr2qvobio2i3jmcs3q4pd6ax2apnhsyiga.
Do not resend this retry. Continue from fresh authoritative D1 and record the
new attempt. Original errors are historical. This canary is supervised, not
unattended. Before any future start or resume after deployment, run
`rtk proxy python3 scripts/sac-172/environment-rollout.py ready --image-sha 48e32b0bf878bb7545d73d1d51754134b17f7772fe4a598f82ac45cd5a540bb2`.
Use a new expected digest only after an intentional validated image change.
The13:45 registry cycle successfully stored both bounded variants27; the earlier
digest conflict is resolved. Current repair CI was still running at13:52.

13:53:49UTC: replacement planning author01a0afa3-fe81-70e0-8e55-bca7ee3fae73
is running (started13:52:35.571) and has read the real D1/R2 scope. Provider process
a3983a01-dbdf-4636-aff3-a919ceb33768 remains alive with current heartbeat.
Private full snapshot /tmp/sac246-reader/2026-09-17T13-53-49.379Z.json retained.
No new D1 errors beyond the historical interrupted-attempt rows. Continue normal
supervision; do not retry or approve anything until a new gate actually opens.

14:45UTC quota recovery: attempt01a0afa3-fe81-70e0-8e55-bca7ee3fae73 failed
13:56:56UTC with a provider usage-limit message, discovered14:39. The full
transcript, planning patch and validation are retained in R2 with verified D1
hashes; planning-usage-limit.json records the original error and receipts.
No completed self-review/result existed. Desktop usage now reports0% used,
but the cloud credential account was not independently compared. No reset or
credit purchase was authorized or performed. Completed pool rollouts were
rechecked and there were no active attempts. Supported cleanup destroyed the
stopped sandbox; one same-run/same-v41 planning retry was established at
14:45:32.153, visit6, workflow
wf-v1-vv6hj6lwdshnryctyi3e6ff4yh5isx7yyqy5u6fnbrz363rdo3fa.
Do not resend it. The retry recreates unfinished planning in the cloud; failed
planning patches are preserved but not selected by current continuation logic.
If the next attempt reports the same usage limit, stop retries and report the
cloud quota/account mismatch. Never consume a reset or purchase credits without
explicit user authorization. Existing desktop quota alone is not evidence that
the cloud limit recovered. Repair CI for PR139 passed on both recovery commits.

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

14:46:15UTC: new planning author01a0afd4-7bad-7dfb-b784-382731adc553 is
running with live process3109827b-24f2-4785-9604-3fcf296f07c0. It has completed
real cloud-authored discovery commands without a repeated quota error so far.
This proves execution resumed, not that the complete stage will finish. Continue
the existing supervision and collect the full result before advancing any gate.

14:53:27UTC: D1 still has planning_author visit6 running, with no open gate or
app resources. Live process and heartbeat are current. The author completed12
commands with no nonzero exits in the captured transcript and has entered its
trusted fresh-context self-review. No repeated quota error observed. Full private
snapshot /tmp/sac246-reader/2026-09-17T14-53-27.307Z.json retained. Do not treat
its interim completed-shaped waiting message as a completed workflow stage.

15:01UTC: planning author completed with its trusted checks passed at15:00:08.735.
Full normal artifacts, patch and self-review artifacts downloaded from R2 and
matched to D1 hashes; planning-author-completion.json records receipts. Native
self-review raised13 quality/traceability findings, all resolved by cloud authors
and accepted on recheck. No supervisor plan edits. Independent discovery is now
running as attempt01a0afe2-3a1f-75f3-8343-5653debd6ef5, started15:00:34.096.
Planning PR43 exists at46846063426db1f8e246cdb3ef9e658e6addc277; its three-file
diff was inspected and fits the intended one-screen Worker/D1/R2 canary scope.
No human gate is open yet. Recheck its final head/diff after independent feedback
and author response before approval. The usage-limit recovery finished the
planning author stage successfully; no reset was consumed.

15:09UTC planning gate completed normally. Inspected PR43 head
46846063426db1f8e246cdb3ef9e658e6addc277 and all four independent no-change
dispositions. Posted authorized Linear approval992725eb-df64-416e-bf97-f5e36251ebb7
at15:08:53.551, then moved the issue to Merging15:08:54.205. Provider delivery
54e3d541-837b-4471-b2e9-596d7943fc65 was consumed for planning visit12 at
15:09:13.797. GitHub confirms PR43 merged15:09:16 as
3672dbb5050c10c882702f96ba58f6356226e963. Design author
01a0afea-5256-732d-b2d8-f71a1b183de4 started15:09:24.546. This is an authorized
normal gate action, not a failure intervention. No final implementation approval.

Independent response transcript audit:12 completed commands, one recovered
no-match search exit and one missing optional readability library probe. Both
repeat STORE-04/05 and are now counted as separate occurrences. The independent
reviewer has an empty generic transcript but nonempty raw-review-output and
claude-provider-proof artifacts; collect these before the final full audit.
