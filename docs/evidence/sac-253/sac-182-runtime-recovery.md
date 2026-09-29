# SAC-182 shared test recovery, 2026-09-29

The trusted Worker used its stored Access service credential against the
lease app's `/api/version` endpoint and received HTTP 200 with `admitted: true`.
The credential was therefore checked by a real deployed Worker call, not just
by a secret timestamp.

Run 2 retained candidate work in PR #137. Its first test lease failed during
setup, before activation or app/provider test work. The coordinator wrote and
read back a failed-setup note on PR #137, removed its four owned resources,
proved each absent, and saved the abort receipt. The site became free at
2026-09-29T06:08:58.475Z. That lease has no test attestation or success close.

The original Cloudflare Workflow instance
`wf-v1-et6zs3l4ndwgsj6qfcetsl5usjwra4wh2z3lwyltor6liv6hbioa` ended
Errored after 5,972 completed steps. Its last successful authority step was
visit 1494; the final system action failed six times. Cloudflare reports
`AggregateError: Original error storage failed; complete errors are in Workers
logs`. The detailed final exception was not written to `workflow_errors` and
was not returned by an Observability query for this instance. Earlier recorded
errors and the original failed-setup fault remain in D1 and R2. The final
exception's cause is unavailable; it must not be presented as diagnosed.

A guarded recovery established a new executor at visit 1495. It stopped before
any new request with `stored workflow definition digest mismatch`. D1 has that
original error under ID `597a5ddc-74a2-4808-b0cd-a6e0c460838a`. The run was
admitted under bundled implementation v44 digest `08ee27af...`, while D1's
older v44 row has digest `5a6cf0b2...`. The bundled v45 definition has the
same content as the admitted v44 bundle except its version field. The next
repair records this exact mismatch and moves only run 2 to registered v45;
the historical v44 definition is retained.

Migration `0068_sac_182_definition_repair.sql` recorded that exact repair in
`workflow_definition_repairs`. A second guarded recovery established instance
`wf-v1-3vl3fmtcwbhyj3i3nhgpazsxxk4osgtmrwujzwhitwvqgs2xmsfq` at visit
1496. It retained PR #137 and candidate commit
`3837087abb16000f115887afe714b4cc2f4acadd`, then requested a new lease:
`21c57acf3c8489cb1cc1438437ad16cc8a835c5a080b5b510a46414bd4ba6b5c`.
The coordinator pinned staging source `f8275c1e21a420febeed40139e16fd90605f7b80`
and created the isolated portal, BettaView, D1, and R2 resources.

The pinned staging app build predates the lease version field. The trusted
lease edge wrapper now reports the fixed base version from its own binding,
and an edge revision tag guards refresh of existing lease Workers. The
BettaView refresh preserves its existing Durable Object migration. Both
protected app origins returned HTTP 200 with the expected source, build, and
base version. D1 saved two service readbacks and moved the lease to `active`
at 2026-09-29T06:44:18.545Z. These facts prove setup and activation only;
candidate, app use, and provider proof remain separate checks.

The trusted candidate build for commit
`3837087abb16000f115887afe714b4cc2f4acadd` was deployed to the two
lease Workers. After Cloudflare rollout settled, D1 stored two matching
readbacks: BettaView version `6aee4ce8-b5ed-430e-a17f-153899c21cc2` at
06:47:50 UTC and portal version `0666c8c5-805f-44ea-87c9-01ecaa01f2da`
at 06:48:53 UTC. The app origins each returned HTTP 200 with that commit and
the saved base version. This is candidate deployment proof, not an app demo.

The first demo agent attempt `12f131c0-a90c-4d7f-942e-543b4178239a`
started at 06:49:09 UTC and blocked at app launch with the saved original
error `test_app_launch_cookie_invalid`. Its Sandbox was destroyed. The
coordinator closed the owned browser, revoked the old app session, retained
its incomplete Showboat as superseded proof, and recorded one exact retry in
`test_demo_attempt_retries` at 07:04:48 UTC. The replacement attempt
`c64950fe-e6c2-4fdf-81de-e841311fab45` started at 07:05:13 UTC. Its
app and provider results must be checked separately.

The replacement got a ready managed browser session, then its real navigation
to the isolated BettaView app returned HTTP 401 `invalid_access_token`.
The pinned SAC-182 candidate predates the test gate auth seam. Its agent
marked all 12 scenarios blocked and retained the original result, validation,
and private blocked-screen capture. A public Showboat readback confirms the
exact checked-out commit, not scenario success.

The first marker update reached Linear at 06:50:50 UTC and was recorded in
the normal signed delivery table. It was not claimed as a test delivery:
Linear indented the marker into the final list item and removed the trailing
newline, so the saved exact after-hash did not match. The marker action
remained incomplete. A later different marker ID was rejected while the old
marker remained. At 07:22 UTC, the original SAC-182 description was restored
and read back through Linear. A temporary blank-line comment showed that
Linear preserves a stand-alone comment with no trailing newline; it too was
removed and the original text read back. Migration 0070 disabled the expired
unclaimed expectation, saved the provider update and restoration as a repair
receipt, and authorized exactly one more blocked-attempt retry. It did not
create a test attestation or provider proof.

The trusted lease wrapper now uses the pinned candidate's exported auth seam
after the lease gate checks Access and its short app session. Candidate Worker
edge refreshes are audited and require two matching running-version reads.
The repair retry is fenced to the recorded attempt, verifies the restored
Linear description hash, closes the prior browser, revokes its app session,
and retains incomplete proof as superseded before rotating the attempt ID.

The third attempt `2a237817-b7a1-4081-a139-76a546ab604f` used refreshed
candidate Workers. BettaView reported the pinned SAC-182 commit and version
`edb1aa50-3306-4241-b9da-d055728cb499`. The agent opened the actual
Settings and PR 137 screens, but `/auth/github` returned HTTP 503 with
`missing_github_client_id`. Its result is `blocked`, with all 12 scenarios
undemonstrated. The original app result and validation are in its complete
R2 manifest `manifest:2a237817-b7a1-4081-a139-76a546ab604f`.
Private screenshots have `sanitizerResult: pending`; none count as public
visual proof.

The third attempt inserted a stand-alone Linear marker. The genuine signed
delivery `6e6fdf39-6fe8-4a6b-b67a-5950d9c762cc` reached ingress at
07:39:48 UTC but followed the normal route, so no test delivery was claimed.
The cause was a missing `TEST_MARKER_KEY_V1` secret on the ingress Worker. The
coordinator has the secret and created the marker. Ingress now resolves the
expected public marker through a private service binding to the coordinator;
the secret stays there. The deployed ingress binding and a later real Linear
event returned HTTP 200. A content-free D1 diagnostic for a manual marker
insertion shows exact issue, team, event time, old and new description hashes,
and stand-alone marker; only the actor and expired expectation window differed.
The manual insertion is not test proof. The temporary marker was removed from
SAC-182, and the original description was read back. A new bounded expectation
and genuine app-actor event are still required.

The candidate app's GitHub OAuth prerequisite was absent from the SAC-253
design. The lease host changes per run, and its exact callback is not yet
registered with the GitHub App. The lease Worker also lacks its OAuth client
configuration. App review and publish paths cannot be claimed as tested until
that prerequisite is designed and provided without giving the candidate
arbitrary provider credentials. The Access token rotation has been proven and
is unrelated to this remaining GitHub authorization blocker.


## 29 September: existing reviewer path and retained failure recovery

The deployed coordinator rechecked the existing test reviewer credential against
GitHub and the frozen provider profile with HTTP 200. This corrects the earlier
claim that another GitHub callback and client secret were required for the
automated demo. The optional OAuth route remains separate. No permissions,
credentials, or provider settings were changed.

The old lease closed at 10:47 UTC through the retained-failure path. It has no
success attestation. Its original candidate, result, transcript, captures, and
failure evidence remain available.

The repaired SAC-182 snapshot is `72c645896dfa63f43d3605f714a37232fcbb5bb7`,
with the current approved main commit as its sole parent. The original history
and repair commits remain on the local backup branch
`codex/sac-182-review-repairs-20260929`. The existing draft PR was updated with
an exact prior-head check. The coordinator adopted the new candidate through
its journaled repair endpoint; no source-run approval or error was overwritten.

Both app bundles, the compiled BettaView Worker, and the candidate's actual
ReviewContinuation/DeosWorkflow module were uploaded and read back with matching
hashes. Two independent runtime builds were byte-identical. Repository tests
passed (654 passed, one skip), the added replacement-receipt test passed, and
all 121 BettaView tests passed. These are local checks and artifact readbacks,
not live review proof.

The fresh lease `a316e923fc780ef96fbec2a08ea1973d0dda1dc9366612228be453c124f1786b`
activated the base apps at 11:45 UTC. Setup found that the new shared runner's
policy omitted the source run's hash-bound test adapter approval. The fixture
loader now reads that original, hash-checked approval through the dispatched
handoff. It does not create a new provider grant.

At 11:50 UTC the disposable review runtime's first version request returned
HTTP 530 / Cloudflare 1016. That original failure is retained. A coordinator
update also interrupted the orchestration heartbeat; the lease was fenced at
11:51 UTC before its demo attempt started. The recovery extension retains its
setup and fixture ledgers before cleanup, rejects any started demo or scenario,
and can produce only a failed setup receipt. The twelve live review scenarios
remain unverified at this point.


The failed setup closed at 11:56:20 UTC with all seven owned resources absent,
including the disposable GitHub pull request/branch and Linear issue. The site
returned to free at revision 1963. Its retained setup ledger has SHA-256
`00a0cba0ea0e316d4621cd1e2a4f15e9491a8745d93660029cc1ddbd965e9d40`.
No test attestation was created. The interrupted executor resumed from its
last idempotent transition using Cloudflare's targeted step restart; earlier
step results and the full pre-restart state were retained.

## Fresh candidate and app checks

Lease `e004f05cb550e79d63f00dfd23c228446ef251edd0d98c80c1736ed4065b1fb4`
uses the repaired commit above. The two app version reads settled at 12:06 UTC:
BettaView `18ffc738-3d48-4f9c-9eef-35d623bf8ccb` and portal
`8f449dc1-845d-4984-b951-fb5542ddfb8b`. The actual candidate review runtime
reported version `57ff8883-642f-4bb7-85d1-ec4a8617f775` with its checked compiled
hash. Early DNS propagation and old-version reads remain in the failure journal.

Demo attempt `9d65b93b-e0ff-47db-ae6f-f9c16a8f9390` started at 12:06:49 UTC.
Its immutable input contains the new review fixture, checked Settings inputs,
and all twelve inherited scenarios. Its workflow prompt is still the frozen
v45 prompt; later capability documentation now travels in the materialized
input so a retry need not alter that approved workflow definition.

The actual BettaView Settings page established the checked reviewer session.
GitHub `/user` returned HTTP 200 through the scoped transport. The candidate
created account policy version 1 at 12:11:39 UTC and version 2 at 12:15:25 UTC;
the database retains version 1 as superseded. Both versions use the same
allowed reviewer. This proves connection and rotation, but does not yet prove
the planned different-user or frozen-run checks. Captures remain private until
the trusted sanitizer passes. No live review scenario is marked complete here.


## 29 September, 12:22 UTC: review page dependency failed

Attempt `9d65b93b-e0ff-47db-ae6f-f9c16a8f9390` ended blocked. Its saved result
and validation say the real BettaView PR page returned `DEOS review story
returned 421`. No review scenario was prepared in the candidate workflow;
Settings reached versions 1 and 2 for the same checked account. None of the
review publication or transition scenarios passed.

The result SHA-256 is
`c63e55f6ef4982e044e08b9c29c6b5d05dedcff91889a2cc81127fb46a9c4bdd`.
The private transcript SHA-256 is
`29f0fcb52e93d80e225989a567edd19a2ca60ddc708e6a1dcfb8b5bdd1425a77`.
Both were downloaded and compared with the accepted artifact records.

The internal BettaView service call uses `https://deos.internal`; the lease
portal edge expected its browser hostname and rejected that call. The repair
uses a named, read-only portal entrypoint. It checks the original lease browser
session and current fence before calling the unchanged candidate portal code.
It allows only review-story and process-artifact reads and strips authority
headers before the candidate handler. Portal provisioning now precedes its
BettaView binding.

The 202,459-byte private Showboat exceeded the previous 200,000-byte collector
limit. The bounded private limit is now 2 MB; the public projection still keeps
only allowlisted output. The OCR parser also preserves an empty final TSV field.
A local Settings projection passed after masking account values. Its public
image has not yet passed the remote sanitizer.

The deployment at this repair is
`9be35d13-c3f7-4322-818a-71145cb49d6f`. The four Sandbox image updates were accepted for rollout to
`sha256:027eb0993c4149a8924b3015b9c1d7517b17a4af61ec0fc31c3fccbcda382714`.
Readback found all 30 variable hashes, 19 secret names, and 60 bindings unchanged.
The full TypeScript suite passed 818 tests, with one existing skip; type checking
passed. These are local checks, not provider review proof.

## 29 September, 12:44 UTC: failed setup retained and closed

The coordinator retained six original attempt artifacts, eighteen capture or
proof source records, and a full snapshot of the lease database's 131 tables.
The private failure record has SHA-256
`c3a873c6d52b2744f1f66df4dc0be4a627417615dca5b34c828a7148d5dca634`.
The record and nested database snapshot were downloaded again and their byte
counts and hashes checked. The marker attestation remains `observed`; it is not
a completed app test.

Cleanup first found a Cloudflare service binding dependency: BettaView still
referenced the review runtime when deletion was attempted. The original
Cloudflare 400/code 10142 response is retained. Cleanup now removes BettaView,
the portal, the review runtime and fixtures, then the stores. All seven owned
resource records were absent when the failed lease closed at
`2026-09-29T12:44:30.495Z`. Its close receipt records revision 2043 and absence
SHA-256 `50da843f6c4c23d9c511f7d7c827ea7600fdd01ab71852d621f9279b02b797ac`.
The environment returned to `free` with no owner.

Migration 0083 adds one explicit retry after a setup-code repair. The operator
request must identify the closed failed lease, unchanged candidate, retained
failure hash, deployed repair revision, and reason. It requires a waiting new
request, no live attempt, no prior review scenario, and a free environment.
It creates no successful test attestation. The next grant checks that exact
retry record. Invalid candidate and revision, replay, failure retention, and
release denial are covered by deterministic tests.

The candidate fixture now retains head changes before later scenarios use
them. A second owned, read-only pull request supports the approved unlinked-PR
check; it cannot accept app review writes and is included in cleanup. This
uses the existing approved test repository and credential. The different-user
part of the Settings scenario remains unverified pending owner direction;
the runner must state that limit and may continue the other approved checks.

Coordinator version `e8084d07-b9c1-421a-b081-4c1ce5e817ad` includes these repairs.
All 30 variable hashes, 19 secret names and 60 bindings match the pre-deploy
snapshot. All four Sandbox apps report `ready` on the repaired image. Type
checking and OpenSpec validation pass; the full TypeScript suite reports 822
passed and one existing skip. The Python suite reports 116 passed. None of
those local checks is a substitute for the fresh app demonstration.


## 29 September, 13:14 UTC: checkout failed before the agent started

Fresh lease `cf726aa84fcf6802a01f2030205ae3f3ee54d7ff6eaf0156a682acfb877deec6`
activated the unchanged `72c6458` candidate. Both candidate services passed two
version reads. Attempt `3d7176d2-cbda-4d00-988b-b04eda1da729` then failed during
repository checkout, before it had a process ID. It retained a complete failure
manifest and destroyed the Sandbox. No app scenario or reviewer session started.

The saved original error was `repository_checkout_transport_failed`. The old
checkout code discarded Git stderr, so its underlying cause cannot be inferred
from that record. The repaired runner retains each retry's stderr, stdout, exit
status and attempt number, with the capability token redacted. The Git proxy
also retains the upstream status, request ID and redacted response body. A
duplicate credential release during startup failure has been removed.

Migration 0084 allows this specific pre-process failure to use the existing
failed-demo cleanup. It requires a complete manifest, destroyed Sandbox, no
started scenario or reviewer session, and verified original error objects. The
retained record has a startup failure and a null agent result; it cannot grant
test approval. Later app failures with started scenarios remain outside this
recovery path.

Coordinator `ce4d6054-3537-4d21-a9e5-a477b2a0bb5c` includes the repair, the
operator-only raw Linear capture importer, and the screenshot OCR update. The
OCR process reads a larger raster while the published image keeps its original
pixels and fixed masks. Local checks accepted a real Linear issue heading and
the earlier authenticated Settings capture. These local copies have not been
published as fresh app proof. All 30 variable hashes, 19 secret names and 60
bindings match the prior deployed settings.

The startup-failure lease closed at `2026-09-29T13:29:38.516Z`, revision 2090.
All seven owned resource records are absent. Its absence hash is
`3640a4c8a4430e8c549910c21af86d790b6b88de66ce28a947a956e831d6f449`.
A separate download verified the retained failure record
`3f7a03265781a6c482658c63b115015040d66f8eccd7d860487b380b9efbec77`,
its complete 131-table database snapshot, and both original error objects.
The record explicitly has a null agent result.

The full TypeScript suite then passed 825 tests, with one existing skip.
Type checking and strict OpenSpec validation passed. Fresh lease
`0ebe69474a9a19ab214e4cd178464db0414f60904211ff559b83a3ab3f521e08`
was authorized through the checked retry operation for the same candidate.

## 29 September, 13:53 UTC: fresh app and public screenshots

The fresh Sandbox checked out the unchanged candidate and started at
`2026-09-29T13:43:32.986Z`. The actual BettaView Settings page connected the
checked reviewer. The next scenario's run froze account policy version 1.
The first scenario was allocated before connection, so it has no frozen
account; that setup alone does not prove rotation or identity isolation.

A fresh Brave capture of the original SAC-182 issue passed the deployed
fixed-mask OCR sanitizer:
https://deos-shared-test-proof.skundu.workers.dev/proof/94e21673-ee3d-4f7d-b7fd-fd377e1d65bc
Its public SHA-256 is
`f6ae5f9af078902e0f0840c03f4ea5071c3dbf9673ac6b767f248e73ef412184`.
This image proves the task identity; it is not a disposable issue transition.

The actual Settings capture also passed after masking account values and
the form controls:
https://deos-shared-test-proof.skundu.workers.dev/proof/7e9c2214-25ca-4b2e-8536-fe0e5ce5bd81
The public URL returned HTTP 200, image/png, 12,943 bytes. SHA-256 is
`7984a0e26c2384f97df405a9441d34dcb64ca600aae96674d7d85b588f3865e2`.
The first masking attempt left a partial button word; OCR blocked it and
retained that error. The corrected mask covers the whole form row.

The review agent is still running. These screenshots do not establish that
review publication, continuation, all twelve scenarios, or cleanup passed.


## 29 September, failed run retained before another attempt

Attempt `b643a592-9f02-41eb-8dfe-5d390beaea64` ended blocked at
14:03:12 UTC. It reached the actual Settings form, activated policy version 1,
and composed two unpublished review drafts. No app review intent, publication,
or gate decision was recorded. The seeded GitHub thread was fixture setup.
Browser reconnects timed out, and later helper calls used an expired 15-minute
capability. These are recorded failures; the app scenarios did not pass.

The private result SHA-256 is
`ac5d23e41915c44e1b2b23e57b6368ecc4d549feceae0bbde659b971cde1e077`.
The full transcript SHA-256 is
`6bbfa7f5b878729c1d7324aa587950da7dab46590d63d0d5ece5cd674eacee0c`.
Both were downloaded and checked before recovery work.

The repair renews the same short-lived agent grant while its attempt, deadline,
lease, and fence remain current. Page actions and browser maintenance now share
one lock. Invalid fixture inputs return a concrete request example. The guide
also explains how to allocate a run after account activation and read current
proof publication status. The browser lock fixes a connection race; a fresh
provider run must still establish whether it resolves the observed timeouts.

Recovery permits only unpublished scenarios: it checks the owned D1, Worker,
and Workflow identities, refuses any review intent or completed gate decision,
stops only the allocated scenario instances, and reads each terminal status
twice. It rechecks effects, retains the original Workflow replies, and then
snapshots the lease stores before removal. The provider contract is
[Cloudflare's instance status API](https://developers.cloudflare.com/api/resources/workflows/subresources/instances/subresources/status/methods/edit/).

Verification: TypeScript and OpenSpec validation passed. The full suite passed
834 tests with one skip and one failure caused by changed diagnostic wording.
Restoring the established diagnostic phrase passed all five focused cleanup
tests. Eight new settlement tests cover existing effects, foreign resources,
changed ownership, retained responses, and repeated cleanup. Live cleanup and
the fresh app demonstration are still pending at this record.


At 14:49:37 UTC, the failed lease closed at revision 2224 after all seven owned
resources passed removal and absence checks. Two old scenario workflows were
already terminated; recovery terminated the third and read all three back
twice. Before and after settling, the lease database had zero review intents,
zero gate decisions, and zero non-fixture provider operations. The retained
snapshot contains all 131 tables and both stored objects. All snapshot bytes
were downloaded and hash-checked before the next lease was authorized.

Failure evidence SHA-256:
`e4997978439049317168964bac3228019597985a1dd160dab7539258bda875a5`.
Workflow settlement SHA-256:
`9ec8b6167a2d0f3c3b525fcd55a63a5550e637d56c7d142875b15d5604d2cf8f`.
Owned absence SHA-256:
`c4d6b3a7eaa4fe726a6acf8e1a93e95f72b1b197c7a433dba1d4395a2289b948`.
No test approval was created by this recovery.

Coordinator `bc240b99-4f3a-491b-a37c-3614b7b3f413` carries migrations 0085 and
0086. Before and after deployment, all 30 variable hashes, 19 secret names,
and 60 total binding records matched. The runner image is
`sha256:cdbf2d32e27f22662fbf025c1654eeda2e015e3fc47061674dddf9ca46cc3bc2`.


The first retry was rejected by the older database trigger with
`test setup retry requires retained closed failure`. Migration 0087 retains
that guard and permits started scenarios only when the same candidate and
cleanup fence have a saved unpublished-workflow settlement. Fifteen focused
recovery tests passed, including missing and mismatched settlement rejection.
The original live error remains in the workflow error store.


## 29 September, fresh repaired run

Fresh lease `8566ef7dc29b67431c182aac293d9ecbd11131706f6e89d87c9e5e732055a100`
was granted with fence 13 for the unchanged SAC-182 candidate. All four runner
classes showed the repaired image ready before the retry request. The lease
owns a new D1 database, R2 bucket, app Workers, review Worker and Workflow,
and disposable Linear issue SAC-264.

A fresh Brave capture of SAC-182 was imported privately. The fixed crop and
OCR sanitizer published only its issue heading:
[task identity image](https://deos-shared-test-proof.skundu.workers.dev/proof/788eee44-a2af-4552-88e0-11c37a458026).
This proves task identity, not the disposable issue's later state changes.

CI for commit `7b3b77f` passed all six push and pull-request jobs. The
[pull-request run](https://github.com/sachinkundu/deos/actions/runs/36586570995)
reports 834 TypeScript tests passed, two skipped, zero failures; 105 portal
and 111 BettaView tests passed; and 116 Python tests passed on both Python 3.11
and 3.14. Builds, binding checks, and configuration validation also passed.
These checks are separate from the pending provider demonstrations.

## 29 September, provider eviction and gate finding

The fresh demo ran from 15:09:37 to 15:24:48 UTC and ended blocked. Cloudflare's
Runs page and its browser binding history both report `BrowserSessionEvicted`
for session `015a07ce-4b5b-48b4-bfd1-36cd6ad850cd`. It started at 15:11:57
and ended 33 seconds later. The previous browser was also evicted. This is a
provider closure, not evidence of a bad Access secret or a browser lock race.

The raw result and transcript remain retained, with these SHA-256 digests:

- Result: `22056397c279baf01bee9b18870d6dabf004e047684cb31a2cd69927346ddd77`.
- Transcript: `076f2eef1bdb6b16629a295d34a3678eab5135ee377d4a1364c5563a29d8da0c`.

The s12 fixture produced signed Linear delivery
`dec7e78c-703d-4102-b11f-e10f2c5283bb`. Its actor differed from the allowed
person, yet the candidate moved from review to the edit wait. The code checked
the allowed ID only for the `implementation` definition. SAC-182 now checks
the saved allowed person on other definitions too. Its new regression test
rejects a different user and then accepts the allowed user exactly once.
All 41 workflow tests passed. This test still needs a fresh provider run.

Recovery retained the s12 failure with its exact fixture, forwarded delivery,
and original payload hash. It verified zero review intents and zero app
provider operations before and after settling all twelve owned Workflows.
The snapshot holds all 131 tables and eleven stored objects. Every object was
read back and hash-checked. All seven owned resources were then removed and
proved absent. The site became free at 15:34:39 UTC, revision 2288.

- Failure evidence: `29e35dddcbe668b40b4afe2781167eb27186aa977f36c67be9845fee8a4ccfd6`.
- Settlement: `c70c82e1229ace146267acf699b40654bbc5d56c9bfacd888f3e77c1dd58a5f5`.
- Absence: `465495bb2b6307f245523873c44dda85ded99175180ad127fce560d15c64afa4`.

Coordinator `ae1d5269-c0a3-4a7c-a66b-7f1a1c142af4` and migration 0088 add one
explicit browser replacement per service and attempt. Two provider inventory
reads must prove absence; the prior ownership row and close history are kept.
No click or submission is replayed. The browser wrapper now preserves a failed
connection's HTTP status and body instead of losing it behind the SDK's null
WebSocket error. All 60 bindings, 30 variable hashes, and 19 secret names match
their pre-deploy values. No provider settings or credentials were changed.

The repaired SAC-182 candidate is `2e8f3bfd65458a92158638666ee7416ba5925460`.
Its parent is still the saved base. The earlier commit has a backup branch and
a retained candidate record. Portal and BettaView builds passed; 121 BettaView
tests passed. Candidate bundles and the review runtime were uploaded, then
downloaded and hash-checked before adoption. No test approval was created.

## 29 September, interrupted setup recovery

Lease `e6b9603323c87d308bd1d9fb11c6cf8b4d59ada85ba3e6599051ac65e515870c`
never started a demo attempt. Setup recorded an HTTP 530 and a missing compiled
BettaView Worker. The raw app bundle and review runtime were present, but the
separate compiled Worker had been omitted. It is now built from the clean,
exact candidate and read back from storage with SHA-256
`9ec415b7565eb222c17ea2af25ad061602a65b7d22c4ab521566422179660680`.

The Workflow also recorded a closed Durable Object connection. Its next
heartbeat was fenced, and it entered `implementation_failed`. All four owned
resources were removed. The site became free at 15:43:21 UTC, revision 2298.
The retained setup receipt was downloaded and hash-checked:
`068666fd81a70d887daae4a4a7e8c172dbacddee1ad74815008cc75fb24b1d25`.
The original connection error remains in the private error store.

The recovery handler now accepts this narrow case: an errored executor, an
exact fenced setup failure, no started demo, and a closed lease with verified
absence. Other terminal failures remain ineligible. Five recovery tests and
the type check passed. The audit transition records the failed node as its
source and keeps the old failure records.

Coordinator `c8c8c431-bba1-42c2-9265-b9783653c4b2` was deployed while there
were zero live agent attempts. Existing binding types, variable hashes, and
secret names matched before and after deployment. Recovery returned HTTP 202
and a new running executor, `wf-v1-bzr3pzs2rqtkahuawd2o4osnzmsdjmaufyaz6et4ffduhkzvhyaa`.
It granted a fresh lease at 15:49:22 UTC with fence 17. App review proof remains
pending; setup recovery is not a passed app test.
