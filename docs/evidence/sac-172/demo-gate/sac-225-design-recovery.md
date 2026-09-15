# SAC-225 design collection recovery

At 15:14 UTC on 15 September 2026, the native recheck marked both design
findings fixed. Its JSON evidence was invalid: three sources were paired with
`not_searched`, and source locators did not name the claims that used them.
The validator correctly rejected that result. The checked design was intact.

The failure collector stopped the supervisor before its private parent
transcript was copied into the output directory. It saved the review journal
and original fault, but could not verify the bounded continuation without the
parent transcript. The run entered `review_reconciliation` at visit 12.

The private live reader had captured the parent transcript at
`2026-09-15T15:14:36.215Z`, before shutdown. The production journal verifier
accepts those unchanged bytes against the durable journal and candidate.

- Parent transcript SHA-256: `8128c9608923b5e5d0054574b1e95d21837dd09958142660b50b25992e760eb4`
- Parent transcript bytes: 158695
- Checked candidate digest: `3e2b6cdb9e904fbc8b57d4f944359ed436f27ce3f4f830470e8ee1234b4fec00`
- Discovery accepted; one repair checked; one recheck invocation failed.
- Exactly one recheck invocation remains. No review result has been changed.

The fix preserves the private parent stream during failure collection and
clarifies the recheck source contract. A guarded operator endpoint can attach
a previously observed transcript to this specific missing-evidence failure.
It verifies the journal, candidate, frozen job, run, and remaining slot before
writing an audit record. The original manifest and failure remain intact.
The existing stage retry then records the transition from reconciliation to
the same author stage. It cannot grant another repair or approve the work.

Local checks: 533 backend tests passed, including source rejection, interrupted
capture, audit replay, stale-run rejection, and same-definition retry. Backend
types and generated Worker bindings passed. These are local checks. Live
recovery and calculator demo acceptance are separate proof obligations.

The resumed author accepted its recheck and exited at 15:55 UTC. It omitted
`design-dispositions.json`, so normal collection failed after storing some
outputs. Failure collection then reused those object keys. D1 rejects that
collision because each artifact key belongs to one manifest.

Failure collection now uses its own versioned prefix and manifest. Existing
normal and partial failure receipts remain intact. Recovery also recognizes
an accepted recheck as output finalization; it grants no further review or
semantic repair. A real SQLite regression covers partial normal collection,
failure capture, preservation of prior receipts, and replay.

At 16:09 UTC, the read-only Sandbox process API confirmed that the supervisor
had exited with code 0. The live reader saved the final transcript and review
journal. The production verifier accepted that journal with the original
audited continuation: both findings are fixed, no finding remains open, and
the checked candidate digest is unchanged. All 534 backend tests, TypeScript,
and generated binding checks pass for the collection fix. Deployment and
successful workflow recovery still need separate read-back evidence.

The collection fix was deployed as Worker version
`31552a02-5e04-42a7-ac14-6dc436829e57` at 100% traffic. Container rollout was
disabled to preserve the stopped author's files. The existing Workflow had
already exhausted its collection retries and was `errored`.

The next fix lets a parent tool call receive the next bounded-review phase
as soon as a child returns. It retains the one-repair limit and checks that
the reviewed candidate is unchanged. Final design completion now checks the
required dispositions file against the exact supplied finding IDs. Missing
or malformed output enters the existing same-session correction loop before
the supervisor reports success. All 535 backend tests and types pass,
including the hook transition and missing/invalid disposition cases.

Restarting the failed collection step (its 41st occurrence) applied the fixed
collector to the existing attempt. At 16:18 UTC, D1 recorded a complete
`failure-v2` manifest with 13 objects and 722530 bytes, while both old partial
manifests remained intact. The Sandbox was destroyed after collection.
Recovery is eligible for `finalize`, retains the accepted recheck, and has
SHA-256 `745a176a930533d3eae6aa7608ff6139b8b643052fc6e57c29bb74a6376becde`.
The run moved to `agent_failed`, visit 14, with `collection_failed` on the
attempt. This is recoverable output failure, not a new design finding.

The finalization retry completed at 16:30 UTC. The author saved an empty
disposition array, passed its completion checks without a repair, and kept
the accepted design. Design PR32 opened at head
`f7d608cbed6e0bf6b88d9eb5c3eb38b4d04c9d22`.

Claude finished independent review at 16:34 UTC with four concerns. The
wrapper then rejected its source pointers: Claude used
`/review/findings/0/message`, while the validator expected
`/findings/0/message`. The cited URL was present in the referenced claim.
The full receipt and original error remain in R2. Failure collection completed
with eight objects and 127791 bytes; both Sandboxes were destroyed. D1 marks
this independent slot eligible for retry.

Commit `4cc04bb` canonicalizes an envelope-root pointer to the review-relative
form. It still requires an existing review string and the exact cited URL.
The saved provider receipt passes local revalidation with all four findings
unchanged. Tests also reject missing claims, citations to the source inventory,
and lookalike hosts, while preserving escaped JSON pointer keys. All 538 tests
pass. This local replay is not durable workflow acceptance.

Correction to the earlier type-check claim: the fresh check found two stale
types from the preceding finalization change. Commit `b267742` updates the
design-completion declaration and the review test callback type. TypeScript
and generated Worker binding checks now pass.

The independent retry started at 17:11 UTC and stopped at 17:14 UTC. Its
protected diagnostic records exit code 1, empty stdout/stderr, and no result
or failure file observed by the status caller. The cause of the process exit
is unproven. No retained issue telemetry was available for the requested
Cloudflare log window. This attempt exhausted the independent slot's retry
budget, so the run entered reconciliation.

The previous operator retry had left the reconciliation wait at visit 12 open.
That stale row prevented the new visit 20 wait from being inserted. The
Workflow retried that bookkeeping error and then errored at 17:19 UTC.

Commit `03e38ea` rechecks final files after observing runner exit and records
the process status if no file exists. Regressions cover a late provider failure
and a late valid receipt. The stage-retry transaction now consumes the exact
wait it leaves. Migration 0048 closed two historical waits with recorded
operator departures, retaining their rows and original causes. No provider
approval or delivery was invented. All 539 tests, TypeScript, and generated
bindings passed.

Migration 0048 applied remotely. Worker version
`9115de9d-d5e3-4a5b-9c5f-d6d398d3d59a` is active at 100 percent; container
rollout was disabled, preserving image
`sha256:0862624411f7280aabd3cb9835eead311f0ca4e12dc3a7880c8f71698b9514f0`.
Restarting only the failed transition's first occurrence restored the wait at
17:25 UTC. D1 shows visit 12 consumed and visit 20 awaiting. No agent was
restarted, and the design has not advanced.

The earlier complete Claude receipt still matches the current design input
and head exactly. Local checks passed for its durable hash, transcript hash,
source snapshots, frozen jobs, grounding policy, review result contract, and
line bounds. It retains four concerns and three citations. See
`sac-225-preserved-review-validation.json`. This proves a preserved review is
available for audited reconciliation; it is not yet accepted by the workflow.

## Staging portal verification, 15 September at 17:47 UTC

The live staging browser shows Implementation for SAC-182, with Demo Plan,
Author, Verification, Demo Gate, and its Human Review branch. SAC-225 has no
Implementation node because its frozen version 25 ends at the design merge.
The route's newer definition does not change that saved run. Its audited
implementation handoff remains pending until the design human gate, before
the canary's authorized design approval and merge.

Commit `556a843` corrects the shared reconciliation display. Planning or Design
now remains Blocked while its review needs recovery, rather than appearing
Complete. It also labels the Human Review branch with the interrupted phase.
The portal suite passed all 102 tests; portal TypeScript and both builds passed.

Staging Worker version `6d35a6ba-b694-44c8-b662-ca75bcee5fd7` was read back at
100 percent traffic. Wrangler exited with an authentication error while listing
zone routes after the Worker had activated. The deployment read-back and live
browser were checked separately. The refreshed SAC-225 accessibility tree shows
Design Blocked, Human Review Design, and Completed Upcoming. This is a browser
state check, not screenshot or canary completion proof. The backend and container
versions were not changed. SAC-225 remains at reconciliation visit 20 with no
active agent, no design approval, and no implementation work started.

## Saved independent review recovered, 15 September at 18:37 UTC

Commit `9c26551` adds an authenticated, audited recovery for this narrow failure.
It verifies the original provider receipt, transcript, source snapshots, frozen
review subject, current GitHub head, and exact failed attempts before accepting
the existing concerns. Both failed attempts and their original errors remain.
The independent invalid count stays at two. Recovery grants no new reviewer
invocation and follows the saved concerns edge to the author response.

All 546 repository tests, TypeScript, generated bindings, and the Worker dry run
passed. Migration 0049 adds the recovery audit. Worker version
`e1e2464a-c870-494d-8491-4ad12d46a829` is active at 100 percent. The container
image remains unchanged. Global active attempts were checked before migration
and deployment.

The first execute request paused the source Workflow, then Cloudflare returned
an internal RPC error. Readback proved the audit was prepared and the run and
review cycle were unchanged. The original error remains in durable diagnostics.
Replaying the same request from that confirmed state succeeded. The audit is
established; the source reconciliation wait is consumed; no provider delivery
or approval was invented.

D1 confirms the four original concerns are accepted and Codex author attempt
`01a0a65b-fd30-712d-9d06-9a66762564e1` started at 18:37:21 UTC. Its state is
running at `design_independent_response`, visit 21. The new Workflow instance is
`wf-v1-e3gx5nyorpr4oof63br5mxg3kgdalmftohvsusg5j7i4srzmox2a`.
GitHub PR32 has a completed neutral design review check from this recovery;
that check is not a design approval. See
[the Showboat remote readback](sac-225-receipt-recovery-showboat.md).

The refreshed staging browser shows SAC-225 Design In progress. Its saved v25
still has no implementation tail. SAC-182 v29 displays the real Implementation
phase, Demo Plan, Author, Verification, Demo Gate, and Human Review branch.
SAC-225 must receive the audited implementation handoff at its design human
gate, before the canary's authorized design approval and merge. Implementation
has not started. This remains an operator-assisted canary.
