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

Activation update: first image2cc009... failed unpacking in the basic pools with
ImagePullRequestedDiskSizeToSmall (4 GB disk). See rollout-disk-error.json. Commit
a2acace changes packaging to headless-shell only and clears npm/apt caches; local
root filesystem is2,166,628,352 bytes and real Chromium regression passes. Lean
deploy log /tmp/local-browser-lean-deploy.log is authoritative for the replacement
version/digest; the earlier digest must NOT be accepted as final activation.

Additional preflight: current SAC-246 engine is pinned to17September version
f45cec59-181e-4c4a-80f5-2256444f2294. All1197provider steps are privately archived
at /tmp/local-browser-engine.json, hash in engine-before.json. Before the canary
transition, restart only this provider engine at its saved D1gate50 so it uses
the new runtime handoff code. Read back its version and unchanged D1gate/definition/
inputs. Do not trigger proposal/design or manually change D1. Engine restart is
an authorized supervisor activation step, not an automatic recovery.

ENGINE RESTART DONE: provider restart succeeded at07:37UTC; new Workflow version
3990ce46-ab11-46f7-9fab-4b1fde94f1e1 (created07:18:59, the browser-runtime source
deployment) now waits at the same implementation_review visit50. D1readback
confirms definition41 and no active attempts. See engine-after.json,
engine-version.json and engine-restart.log. Do NOT restart it again.

LEAN UPLOAD DONE: final Worker b60ee177-9cee-4f93-8b71-20a2b95771b0.
Expected container digest is now
ca916761bbebebe45e69f560505a367c3a92bc31364b35da8f505eb5d71d2958.
All four image repositories uploaded successfully; require completed, healthy,
100percent rollouts for this digest before posting PR45 request/Linear transition.

CANARY STARTED: all4pools completed at expectedca9167digest, healthy4each, no
errors or starting instances. Receipt activation-complete.json. PR45 instruction
posted at https://github.com/sachinkundu/deos-sample-project/pull/45#issuecomment-5726959055.
Linear In Progress at07:51:30.774; provider deliveryd267682c-b639-41ad-9eab-7f4b3464b8b1
consumed and transition to implementation_build visit51 at07:51:51.477.
Attempt01a0b380-2dbf-70a5-8ecb-6fca8d3a5fe5 is RUNNING on basic sandbox
impl-v1-p4mcggrwbhq7zjr4d5iieesvag2bdgeexxa2zjhdpvwqvpj2zuwq.
Process4adb6fdb-fa98-411e-aeb0-d49a2ff3fbc5 started07:52:11.656.
Frozen definition, approved design/base, checked input and branch unchanged,
verified in canary-start.json. Do NOT repeat PRcomment, Linear transition or
engine restart. Continue supervising this implementation attempt and its gates.

08:02UTC supervision: same build attempt remains running. New LOCAL-01 progress
notification timeout, LOCAL-02 completed-task transition rejection and LOCAL-03
check-current-1 failure are logged and were reported once. Detailed source is
repeat-errors-0800.json. The failed test's local adapter asserted message?.id===id,
causing setup save500 vs201. Cloud author inspected the harness; isolated
test-api-read-rerun-1 passed08:01:27. Full test-current-rerun-2 is active. No local
app edits, workflow deployments, restarts or new gate actions. Let the cloud agent
finish recovery; do not infer an intermittent cause is fixed from one rerun.

08:10UTC: same attempt still running. Full16test rerun and build passed without
source changes (LOCAL-03 recovered; root cause unknown). Chromium153.0.8010.12
started over local-pipe08:06:24 and opened the actual loopback app. LOCAL-04 first
remote publish health1042 failed, but cloud retry publish-remote-current-2 made
the same environment ready08:08:09.605. LOCAL-05 unsupported objects prefix was
removed and R2listing succeeded. Both errors reported once and logged with original
receipts. New environment deos-tmp-707e60c64357d9e1197de094; D1database
2b32065e-aa45-472f-b0b2-ace06f52d561, R2same environment name. Do not delete while
active. Agent is preparing demos. No new durable workflow errors, no supervisor
app edits, no deployment or retries by supervisor. Browser screenshots, remote
TLS, independent review, proof publication and cleanup still await verification.

08:18UTC: no new error cause/occurrence found in full live diagnostics since last
check. Same build remains active. Demo collectiona0c2c690-b6b8-407d-b304-1e0a1d3c5f71
completed08:12:00 with6scenarios and10captures: local-loopback smoke plus remote
empty, save/read/refresh/delete, fresh-context persistence, validation, literal
markup. first-cloud-demo-receipt.json retains the complete trusted receipt.
Three R2images were downloaded, SHA256verified and stored in cloud-captures.
Supervisor visually inspected loopback and remote-fresh-context originals: real
app UI, local uninitialized-storage error explicitly captioned, remote Greeting
body persisted and opened after reset. This proves local pipe/loopback/remoteTLS
and actual remote browser behavior; local error-state rendering is not local
storage success. No relay or Browser Rendering allocation is claimed.
Raw real D1/R2 receipts and exit0 verification in first-cloud-storage-proof.json
show2active rows with matching12byte objects, deleted Sign-off tombstone with
zero bytes and no corresponding object. The cloud author selected11proofitems
(10images+Showboat) and is now checking older review feedback for completeness.
Do not interrupt; fresh review and final publication/cleanup still pending.
No application or workflow code was edited by supervisor this heartbeat.

08:25UTC: same build attempt, no new D1workflow error. LOCAL-06 oversized demo
request1,057,596bytes rejected pre-execution at1MiBlimit. Cloud author reduced
body size and is running demo-current-final-3, collection97e4d234-cd51-44c1-9082-
84e74386559b. Six earlier scenarios completed; capacity scenario uses98one-byte
saves to exercise100object ceiling and is progressing (step235 at08:24:23).
No need to intervene in healthy running actions. Original error saved in
oversized-demo-request.json and reported once. The first completed collection's
images remain diagnostic/proof history; verify final selected gallery when done.
Fresh independent demo gate still has not run. No supervisor code edits or
runtime deployment. Keep monitoring automatically.

08:33UTC: replacement demo-current-final-3 completed08:27:33 with7scenarios and
11captures; selected final gallery has11images+Showboat. Capacity scenario used
real browser-created100object limit, and final raw R2list has100objects and
truncated:false. Saved final-cloud-demo-receipt.json/final-cloud-storage-proof.json.
LOCAL-07 unsupported --request flag in final status command caused ENOENT; agent
corrected immediately to positional file and status succeeded. Error and recovery
saved in status-cli-recovery.json and reported once. LOCAL-06 automatic recovery
completed; no supervisor app changes. Agent final audit/handoff in progress;
verify the fresh independent review is actually entered.

FRESH GATE CONFIRMED08:33UTC: author attempt completed and workflow automatically
entered implementation_demo_gate visit53. New reviewer attempt
01a0b3a5-9b6f-72aa-83e7-c0909f02bf1c started08:32:50.281, sandbox
sbx-v1-gvkvsxj37vjkpir7d7b2rtzh7vfj76c4yuwmypbv54cjbnkrseva.
fresh-review-start.json proves the browser-runtime handoff guard exercised a new
review, rather than reusing the old review. Do not send a gate event or restart
author. The existing frozen single-response policy still applies after review.

08:35UTC completed author audit:5R2artifacts SHA256verified via
/tmp/local-browser-collect-artifacts.py, index/tmp/sac246-local-browser-artifacts/index.json.
Browser close08:32:30.875 is in completed-author-audit.json. No source patch change
claimed by author; selected11images+Showboat. New LOCAL-08 native apply_patch
blocked by hook while making status-final.json08:31:36; corrected totee and then
the separately logged CLIcorrection. Native-hook-error.txt retains original.
Completion manifest omits original-errors.jsonl; progress timeout retained only
by live supervision, an existing diagnostic gap. Reviewer attempt01a0b3a5...
remains running; native stderr has MODULE_TYPELESS_PACKAGE_JSON warning only
(nonfatal warning, excluded from failure counts). Reader may show no reviewer
transcript because its model output is separately collected at completion.

08:47UTC: fresh reviewer completed needs_work at08:39:07. It inspected all11images
and raw storage proof, accepted them, and found missing real failed read/delete
demos (LOCAL-09, repeats an old evidence gap). Automatic response attempt
01a0b3ab-7236-70ce-b078-3ef77d633c9a started but FAILED with provider model capacity
at08:42:50 (LOCAL-10). Original-errors and failure recovery files hash-verified;
see response-* artifacts. Also task6.6 invalid completed→active recurred and an
adjacent native exec transport reported UnknownProcessId66805; causal relationship
with capacity unknown. The task correction was prepared but completion unproven.

No active global attempts; failed sandbox destroyed at08:43:15. One supported
supervisor same-stage retry established08:47:20, same model, tier and definition.
New Workflowinstance wf-v1-oj4wx5st64h4hkn4wyjn25sl6du4twlkhlfwtgk5tdh4pt46yheq,
implementation_build visit56. See response-retry-request/receipt.json. This is
supervisor recovery, NOT autonomous. No app edits/deployment. Do not replay retry
for failed attempt01a0b3ab or reuse prior workflowinstance. If capacity recurs,
report it and back off rather than repeated immediate retries or model fallback.
Add new attemptID to /tmp/local-browser-collect-artifacts.py once available.
Keep owned test resources until durable PR45 proof saved and normal cleanup runs.

09:04UTC owner policy update: external services are expected to fail. Use bounded
safe retries with backoff before escalating; preserve originals and recovery state;
notify only after exhaustion or when owner action is needed. Recovered transient
service errors remain in the failure log without user notifications. Existing
heartbeat prompt was updated to match. Never blindly replay ambiguous writes or
browser actions. The same-session Codex retry fix is prepared in separate draft
PR141 https://github.com/sachinkundu/deos/pull/141, branch codex/provider-retry-policy,
worktree /Users/sachin/code/deos-provider-retries, commitfe1779e.630tests passed,
1existing skip, typecheck and real-supervisor Linux fault-injection passed. NOT
DEPLOYED. Broader external-service coverage is explicitly incomplete and tracked
in docs/external-service-retry-policy.md in that worktree. Do not deploy over the
current active retry01a0b3b2-fdfc-762b-9cf2-eea18365d827. No new canary transition
was sent as part of this policy change. Continue current canary supervision.

09:12UTC heartbeat: retry01a0b3b2... stillactive, original capacityfailure has not
recurred. Agent passed16tests/build, provisioned new environment
29e1a604cd5e918d7382569b (D1fec52572-2a45-48db-bbef-306a155a9c68), collected the
failed-read/delete proof using explicitly synthetic D1 inconsistency after two
failed fixture scenarios. LOCAL-11..14 and repeated08logged with originalerrors;
no owner alert because agent recovered. Completed collection6378856f-9194-4940-
b247-9e6db526f7dd has4captures/3unique selectedimages; all3downloaded, hashchecked,
visually inspected in cloud-captures/response-{6,9,12}.png. Raw D1/R2proof saved.
Agent final audit stillrunning. Do not reenter reviewer/author or deploy.

Original repeat environment707e60...was auto destroyed08:46:12 on terminalfailure;
readback09:08has cleanupreceipt. NEWenvironment29e1a...requires finalcleanup.
At publication verify earlier11main-flowimages remain durable/accessible alongside
these3new failure-path images. Fresh reviewer was needs_work; frozen policy gives
one author response then human gate, not a second independent pass. Judge the
final repaired evidence accurately. No new policyfix deployment (PR141draft).
