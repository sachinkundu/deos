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
