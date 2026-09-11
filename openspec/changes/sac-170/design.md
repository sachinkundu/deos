## Context

DEOS already freezes a workflow definition for each run. It also keeps graph
authority in D1, large immutable evidence in R2, and provider writes behind the
trusted Worker. OpenSpec authors run in disposable Sandboxes with typed jobs.
The portal reads durable review data rather than creating proof during a page
load. See [the current architecture](../../../docs/current-architecture.md)
for those boundaries and [proposal.md](proposal.md) for the reason for this
change.

The current planning flow gives self-check and independent review their own
workflow stages and can start new semantic review after an edit. This design
moves self-review into the first author job and gives each phase one accepted
independent review. It preserves the frozen graph, provider boundary, and human
gate rules.

The approved requirements are split across the
[review cycle](specs/openspec-review-flow/spec.md),
[agent grounding](specs/grounded-openspec-agents/spec.md),
[fixed workflow](specs/simplified-planning-workflow/spec.md), and
[portal observability](specs/workflow-observability/spec.md) specifications.
No current external service claim is needed to choose this design, so it does
not depend on a web source.

## Goals / Non-Goals

**Goals:**

- Make review count and scope enforceable by trusted state, not by prompts.
- Keep self-review inside the first author attempt while preserving useful,
  addressable logs for both review calls.
- Bind independent review to one published head and show when later work is not
  covered by that proof.
- Give each role a hash-checked context and a capability-bounded set of search
  and skill tools.
- Let the portal derive the flow view, review detail, and transcript state from
  the same durable records.

**Non-Goals:**

- Replace D1 graph authority, R2 evidence, the Sandbox boundary, or trusted
  provider adapters.
- Change model routes, let an agent approve work, or add provider rights.
- Backfill new semantic proof for an old run or rewrite an old definition.
- Define line-level implementation tasks or a new general review framework.

## Component diagram

~~~mermaid
flowchart LR
    W[Cloudflare Workflow<br/>frozen definition] <--> D[(D1 authority)]
    W --> C[Pre-author context and capability builder]
    C --> A[First plan or design author job]
    A --> H[Trusted completion hook]
    H --> SI[Post-draft self-review input builder]
    SI --> SR[Read-only self-review subagent]
    SR -->|fixed findings| A
    A -->|one fix turn| H
    H --> RC[Read-only closed recheck]
    H --> R[(R2 candidates, results, logs)]
    RC --> R
    H --> P[Trusted publish adapter]
    P --> PR[Phase pull request and head]
    PR --> IR[One independent review stage]
    IR --> AR[Author response job]
    AR --> P
    P --> HG[Human Review gate]
    HG -->|edit requested| RA[Revision author job]
    RA --> TV[Trusted checks and read-back]
    TV --> HG
    D --> O[Access-protected portal]
    R --> O
~~~

The self-review calls are children of the live author attempt. They are not
workflow nodes and do not advance the run visit. Independent review remains a
workflow stage. Trusted publication and read-back remain the only path from an
agent artifact to a human gate.

## Event flow

### First plan or design

1. The Workflow enters the first author node from the run's frozen definition.
   Before it starts the Sandbox or author, the Worker builds the context and
   capability manifest and binds it to the new attempt. The manifest names every
   checked input by path, byte count, and SHA-256. It also binds web search,
   pinned skills, and the effective capabilities. For design, it includes the
   complete approved plan and allowlisted architecture guides from the proved
   planning merge commit. The author receives that checked context and tool set
   for the first drafting message.
2. The author writes only its allowed phase files. The completion hook runs the
   phase's deterministic path, OpenSpec, whitespace, and readability checks.
   Semantic review does not start until these checks accept a complete draft.
3. After the valid draft exists, a separate trusted builder creates the
   self-review input. It combines the exact candidate manifest with the same
   checked plan and architecture context, applicable requirements, the
   read-only reviewer role, and the result schema. The hook starts one fresh
   self-review child with no forked author conversation. The reviewer returns
   one ordered finding inventory with stable IDs and source locations. It cites
   any web sources it used.
4. If the inventory is empty, the hook closes self-review and marks the fix
   state not needed. Otherwise, one D1 compare-and-set allocates a stable fix
   turn ID for the phase and marks it issued before the author receives the
   whole inventory. The author may return one semantic fix output. The
   controller marks that turn consumed and saves its candidate digest before it
   checks the changed files. The original valid candidate remains available as
   a fallback.
5. A restart reloads the phase-level fix state. It may resume the same turn only
   when the supervisor can prove that the same author session has not returned
   an output. It never allocates a second fix turn. If completion is ambiguous,
   the session cannot resume, or the one output is invalid, trusted code keeps
   the original valid candidate as the recheck candidate.
6. Whenever discovery found at least one item, the hook starts one fresh,
   read-only closed recheck. It uses the valid repaired candidate when one
   exists; otherwise it uses the original valid candidate. Its result schema
   lists the original IDs as a closed enum. Each ID must be rated “fixed” or
   “open”. Trusted code discards unknown items and treats a missing or malformed
   rating as open. Thus fallback never skips the required recheck, and neither
   candidate path can create a finding or another author turn.
7. Trusted code stores the candidate, context manifest, review results,
   transcripts, and derived open set. It then publishes the candidate and reads
   back the pull request head. A successful read-back records the reviewed head.
8. The Workflow enters one independent review stage for that phase. The review
   receives the published inventory and exact head. One structurally valid
   result fills the phase's independent-review slot. Concerns do not fail the
   stage.
9. One author-response job receives every concern and records “applied”,
   “declined”, or “no_change” for each ID. It may edit only the phase artifact.
   Trusted checks, publication, and read-back produce the current head. No
   independent reviewer checks the response or that head.
10. One guarded gate-entry batch checks the complete phase cycle: applicable
    self-review slots, consumed fix state, independent review, all concern
    dispositions, current validation receipt, trusted pull request read-back,
    current node, and visit. It then binds the reviewed and current heads and
    opens a new visit of the phase's Human Review gate. The gate shows the
    self-review inventory, open items, independent result, all author
    dispositions, and both heads. Agent text cannot approve or select the
    outgoing edge.

### Human-requested revision

1. A signed user event at the active gate selects its existing revision edge.
   The Workflow enters the phase's revision-author node with the comments, the
   current artifact, and historical review proof marked as prior proof.
2. The author makes the requested edit. Trusted phase checks run, publication
   updates the same pull request, and provider read-back records the new head.
3. The Workflow returns to the same logical Human Review gate with a new visit
   identity. It does not enter a self-review or independent-review node. The
   portal labels the old reviewed head as stale when it differs from the new
   head and states that no new semantic review was due.
4. Further requests repeat this revision path. Human approval remains the only
   event that can authorize the phase merge.

### Tool and source use

The trusted context builder starts from a role-to-tool policy stored in the
frozen definition. It intersects that policy with the job's existing
capabilities. Authors keep only their current file scope. Reviewers remain
read-only. Web search adds outbound reads but no generic network credential,
secret, repository write, GitHub, or Linear capability.

Each role gets pinned skill identities and digests. The Cloudflare bundle is
included when the checked task scope can touch Cloudflare. Other skills are
selected from the same frozen allowlist by role and task tags. Skill text is
untrusted task data, not authority. Web pages are also untrusted data. Neither
can supply system instructions or trigger another tool. Every tool call still
passes the job's capability check.

Search runs through a trusted read-only broker, not through generic Sandbox
network access. Its request schema allows only short search terms about public
products, standards, or behavior. It rejects file contents, diffs, manifests,
credentials, secrets, long opaque values, and high-entropy text. Fetches allow
HTTPS public hosts only. The broker rejects URL credentials, nonstandard ports,
private or link-local addresses, unsafe schemes, and redirects or DNS results
that cross those boundaries. It limits response type, size, and time and
returns inert text with active content removed.

A role that uses a current outside fact must attach a source record and cite the
source in its artifact or review result. The source record contains the public
URL, title, access time, and the finding or artifact claim it supports.
Telemetry keeps bounded host and outcome data plus a request digest. It redacts
query text and never stores fetched bodies, headers, checked repository
contents, or secrets. Search results are not treated as provider proof and
never authorize a state change.

## Decisions

### 1. Add a new immutable definition instead of changing the active graph

The next bundled workflow version will encode separate first-author and
revision-author paths for both plan and design. Only the first path contains
the independent review edge. The self-review protocol lives in the first-author
job contract, so the main graph has no self-review phase.

This keeps each run's definition, graph, model routes, and review rules frozen.
The alternative was to branch on mutable counters inside the current graph.
That would make a resumed old run depend on newly deployed behavior and would
weaken its saved proof.

### 2. Make accepted review slots the cardinality guard

Each phase cycle has one self-discovery slot, one stable semantic-fix turn ID,
an optional closed-recheck slot, and one independent-review slot. The fix state
is phase-level: not needed, available, issued, or consumed. A new Workflow visit
or stage retry reloads that state and cannot allocate another ID after issuance.
A compare-and-set write accepts the first valid result for each review slot.
Exact retries reuse the accepted record. A provider or schema failure may retry
an empty review slot, but two valid semantic results cannot become active proof.

Before a model call, one guarded D1 insert creates a review execution intent
with a unique execution ID and package ID. It succeeds only while the phase slot
is empty and no live intent owns that slot. A concurrent delivery reads the
same intent and reconciles it instead of starting another model call. The intent
moves through allocated, collecting, verified, accepted, or abandoned states.
A timed-out intent can become abandoned only by compare-and-set after its child
execution and cleanup are terminal; a later call then gets a new identity.

Create-only R2 keys use the intent's package ID and object kind, not the input
digest. The package manifest records the input digest plus the exact result,
source, and transcript object identities, byte counts, and SHA-256 values. The
controller reads every object back and verifies it before the package becomes
eligible. A retry with an empty slot selects the one live intent from D1. It
never guesses from R2 object listings.

One D1 transaction compares the phase slot with empty and, for the winning
package, inserts its evidence manifest, finding rows, source index, derived open
set, review-job outcome, and a projection-ready marker. Concurrent packages
never share objects. A losing package remains unindexed and can be collected.
A retry first reuses a winning slot. If the slot is empty, it reconciles the
single live execution intent and only bytes captured under that package ID. A
repeated model call is allowed only after the prior intent is safely abandoned,
and it always gets a new execution and package ID. Slot acceptance also marks
the winning intent accepted and every older intent for that slot abandoned.
Garbage collection deletes only unindexed package objects whose intent is
abandoned and whose retention deadline has passed.

Publication requires each accepted slot to be projection-ready. For a first
phase, the gate-entry transaction requires the self-discovery slot; an explicit
no-findings marker or, when findings exist, a consumed fix turn and the closed
recheck slot covering every frozen ID; the independent-review slot; exactly one
author disposition for every independent concern; a successful phase
validation receipt for the current candidate digest; and trusted publication
read-back of the saved pull request identity and current head. It also compares
the expected run node and visit, requires no existing binding for that visit,
and verifies that the reviewed and current heads in the summary match those
records.

One guarded D1 batch then inserts the gate binding, its open-item projection,
and the matching transition. A later human-revision gate uses a separate
predicate: the prior review cycle must exist, the revision validation receipt
and provider read-back must match the new current head, every bounded human
comment must have a response, and a no-new-review-due marker must name that
prior cycle. It does not require or create a new semantic slot.

A crash before slot acceptance leaves only an anchored incomplete package. A
crash after acceptance cannot hide findings or sources because their query
projections committed with the slot. A crash before gate binding is reconciled
from committed review rows and trusted head read-back; an exact replay reuses
the visit binding. Missing or corrupt accepted evidence fails closed and is
never rebuilt under a different semantic result.

Prompt instructions alone were rejected because they cannot stop duplicate
workflow delivery or a resumed process from creating another active review or
fix. Counting Sandbox attempts was also rejected because transport failures are
not semantic review results. Writing D1 before R2 verification was rejected
because it could make an incomplete evidence set authoritative. Keying
nondeterministic outputs by input digest was rejected because concurrent
executions can produce different complete packages. Committing query
projections after slot acceptance was rejected because a crash could hide the
concerns from the human gate.

### 3. Keep self-review as child work with separate evidence identities

Both self-review calls run under the first author attempt and completion hook.
Each call still gets its own job ID, input digest, result digest, source list,
and transcript manifest. The parent author attempt also owns one continuous
transcript manifest. That transcript covers drafting, completion-check
messages, delivery of the fixed finding set, and the embedded fix turn. Child
start and finish events carry the child job IDs, so the author transcript can
link to each separate read-only review transcript.

Each child runs in a fresh isolated review Sandbox under the parent author job,
not inside the author's writable filesystem or process environment. The
supervisor stages only the hash-checked candidate and context as read-only
inputs. It mints a child-scoped capability that permits those reads, the trusted
search broker, and the pinned reviewer skills. The capability has no repository
write, provider, secret, parent capability, or general network right. The child
starts with no forked author conversation.

A durable child execution row records its parent attempt, review intent,
Sandbox ID, capability digest, input digest, result package, transcript, and
cleanup state. The result package must be durable and the Sandbox cleanup must
be terminal before the completion hook continues. Retry reconciles that row and
never moves child authority into the parent. The normal cleanup reconciler also
covers these child Sandbox IDs.

The portal resolves “View transcript” by owner kind and owner ID. Selecting the
author step uses the parent attempt ID and opens its continuous log. Selecting a
nested self-review uses that child job ID. This keeps author and reviewer logs
useful without presenting child work as a main-flow phase.

A separate Workflow node was rejected because it would continue to look like a
separate phase and would let graph retries repeat the author-review loop. Reusing
the author's conversation for review was rejected because it would not be an
independent, read-only check of the full valid draft.

### 4. Close the recheck over trusted finding IDs

Trusted code freezes the first finding inventory before the author sees it. The
recheck input and schema contain that exact inventory. The controller derives
the final open set; reviewer prose cannot rename, merge, split, or append an
item. Missing ratings remain open, so a malformed response cannot silently
clear a concern.

An open-ended second review was rejected because it could discover new work and
start an unbounded repair cycle. Matching findings by text was rejected because
small wording changes would make identity ambiguous.

### 5. Preserve exact-head truth without repeating independent review

The phase stores both the head that the independent reviewer saw and the latest
published head. Proof is current only when the heads match. Author dispositions
and changed-file hashes explain the transition between them, but they do not
claim that the later head was reviewed.

Running an independent recheck after the response was rejected by the approved
one-pass rule. Hiding stale proof was also rejected because the human needs the
review history and the coverage boundary.

### 6. Build role context and tools from a frozen manifest

The Worker creates a hash-addressed context manifest before each agent starts.
For design, a trusted allowlist admits the approved plan and only the root agent
or architecture guides supplied from the proved merge commit. Optional files
that are absent are not invented. The manifest also pins the role's search
flag, skill bundle digests, and effective capability digest.

Letting agents discover arbitrary repository context was rejected because the
result would not prove what informed the design. Letting a skill grant tools was
rejected because instructional text must not widen authority.

### 7. Project one durable review model into both portal views

The run view groups child review jobs by their parent author attempt and shows
them inside that step. The review page shows the complete evidence timeline.
Independent review remains a top-level phase. Transcript links address a
specific saved job, not a generic phase name.

The transcript adapter is selected by the run's frozen evidence-format version.
For the new format, a verified manifest with zero events returns a typed empty
result and the portal renders “No transcript content was captured.” A missing
manifest or digest mismatch is an integrity error.

Before rollout, a trusted additive classifier enumerates saved author,
self-review, and independent-review jobs for each supported frozen legacy
format. Its format registry names signals that already exist for that format:
the definition digest and job kind, terminal attempt or result manifest, legacy
transcript locator when one was written, and the format's historical capture
mode. It reads any located object, verifies the saved size and hash when
present, and parses its event count.

The classifier writes a separate classification row with an evidence digest; it
does not edit the old job or proof. It marks verified empty only when a
hash-verified object parses to zero events, or when the frozen format's capture
contract never created an object for that job kind and the terminal attempt or
result manifest proves that exact job completed. Missing bytes from a format
that required an object are corrupt, not empty. An unknown format remains
unsupported until its signals are defined. The portal uses only this durable
classification for a legacy empty state, so old rows need no speculative
marker or destructive backfill.

Portal readers for an evidence format become part of its compatibility
contract. Once any run selects that format, deployment and rollback must retain
its read adapter. A rollback may disable the new presentation or select the old
workflow for later runs, but it cannot remove read support for existing new
runs.

Maintaining separate portal-only review state was rejected because it could
drift from graph and evidence authority.

## Minimal data model

The names below describe logical records. Implementation may extend the current
D1 review and attempt tables rather than create one table per record.

| Record | Identity and required fields | Storage and purpose |
| --- | --- | --- |
| agent_context_manifest | attempt ID; phase; role; definition digest; ordered input paths, sizes, and hashes; web-search flag; pinned skill IDs and digests; effective capability digest | Immutable R2 object with a D1 hash reference. Proves the checked inputs and available tools. |
| phase_review_cycle | run ID plus phase; first author attempt; state; candidate digest; reviewed head; current head; self-discovery ID; stable fix-turn ID and state; optional recheck ID; independent-review ID | D1 authority row. Owns the accepted review slots, the one semantic fix, and exact-head coverage. |
| review_job | job ID; cycle ID; kind; parent attempt; input digest; result digest; outcome; model-route reference; created time | D1 index to immutable R2 input and result. Kind is self discovery, self recheck, or independent. |
| review_execution_intent | execution and package IDs; cycle and slot; input digest; state; child execution ID; retention deadline | D1 recovery anchor created before a model call. At most one live intent owns an empty slot. |
| child_review_execution | child ID; parent attempt; Sandbox ID; capability and input digests; package ID; transcript; cleanup state | D1 lifecycle record for the isolated read-only reviewer and its cleanup. |
| review_evidence_manifest | unique package ID; cycle and slot; input digest; result, source, and transcript object identities, sizes, and hashes; manifest digest | D1 row inserted with the winning slot and all query projections after every package object is read back. |
| review_finding | cycle ID plus origin and finding ID; ordinal; summary; artifact location; status; response; response head | D1 query model committed with slot acceptance. Self items use fixed or open; independent items use author dispositions. Original text and locations remain immutable. |
| source_record | job ID plus source ID; URL; title; accessed time; supported claim or finding ID | D1 index plus immutable R2 detail. Exists only for sources a role used. |
| transcript_manifest | owner kind and owner ID; R2 key; SHA-256; byte count; event count; format version | D1 integrity reference for an author attempt or review job. An event count of zero is valid when its format contract permits it. |
| legacy_transcript_classification | job ID and frozen format; status; checked legacy locator or no-capture contract; evidence digest; classified time | Additive D1 projection that records available, verified empty, or corrupt without changing old proof. |
| human_gate_binding | run, phase, visit; pull-request identity; current head; reviewed head; open finding IDs; no-new-review reason | Existing visit-scoped gate authority extended with review coverage shown to the person. |

Large prompts, results, citations, transcripts, and candidates stay in
create-only R2 objects. D1 keeps identities, hashes, status, head bindings, and
fields needed by graph decisions and portal queries. No token, authorization
header, raw provider response, or secret is stored in these records.

## Failure modes

| Failure | Required behavior |
| --- | --- |
| Checked plan or architecture input is missing or has the wrong hash | Fail before the author starts. Do not build a partial context or publish a design. |
| First draft fails deterministic checks | Resume only through the existing bounded completion-check path. Do not start self-review until a complete valid draft exists. |
| Self-discovery call or result is not structurally valid | Leave its accepted slot empty and fail the author job with a typed cause. An operator retry may fill that same slot; no partial inventory reaches the author. |
| Child reviewer crashes or cleanup is not terminal | Keep the review slot empty and the parent hook stopped. Reconcile the durable child row and Sandbox before reusing or abandoning its execution intent. |
| Author's one semantic fix output fails trusted checks | Persist the phase fix as consumed, keep the original valid candidate, and run the one required closed recheck against it. A retry cannot grant another fix. |
| Restart occurs while the fix state is issued | Resume only the same stable turn when the supervisor proves the same session has no returned output. Otherwise consume it conservatively, keep the original candidate, and run the closed recheck against that fallback. |
| Recheck emits a new ID | Discard the new item and record a protocol violation. It never enters the inventory or starts another author turn. |
| Recheck omits or corrupts an original rating | Derive that original item as open, close self-review, and carry it to independent and human review. |
| Crash leaves an incomplete review package | Keep the slot empty and reload its single live execution intent from D1. Reconcile only that package. Abandon it by guarded update after child cleanup before any new model call or package ID. |
| Crash follows accepted slot transaction | Findings, sources, open state, job outcome, and projection-ready state already committed together. Reconcile publication and gate binding from that package and trusted provider read-back. |
| An accepted evidence object is missing or has the wrong hash | Fail closed before reuse, publication, or gate entry. Do not replace it with a new semantic result. |
| Duplicate delivery tries to save another valid review | The slot compare-and-set loses. Verify and reuse the winning package and append only duplicate telemetry. |
| Independent review has valid concerns | Save the result and continue to one author response. Concerns are judgment input, not a failed stage. |
| Independent review transport or schema fails | Keep the independent slot empty and enter the typed failure path. A stage retry targets the same slot and phase. |
| Author response omits a concern or uses an unknown disposition | Reject the response before publication and human-gate entry. |
| Publish succeeds but read-back is missing or has a different head | Record an ambiguous provider effect and do not open the human gate until trusted reconciliation establishes the head. |
| A later human edit fails checks | Do not publish or return to the gate. Follow the revision author's typed failure path without starting semantic review. |
| Search is unavailable for a required current fact | The role must omit the unsupported claim or fail its job. It may not present cached model knowledge as a checked source. |
| A search query contains repository text, a secret-like value, or an unsafe URL | Reject it at the broker, return a bounded reason, and store only redacted telemetry. Do not attempt the request. |
| A skill or web page contains instructions or requests another tool | Treat it as inert task data. The agent may use factual content, but only its trusted job prompt and capability policy can authorize a tool. |
| A skill or search tool requests a forbidden action | Deny it at the capability boundary, record safe telemetry, and keep the job's original authority. |
| A valid new transcript or verified-empty legacy classification has no events | Return the typed empty state and explanatory message. Do not return an error page. |
| A legacy job has no classification | Run or resume the trusted classifier. Do not infer empty from absence while its supported-format signals remain unchecked. |
| A required transcript manifest or bytes are absent or fail their saved hash | Show an integrity error for that job. Do not call corrupt evidence empty. |
| A new deployment sees an old run | Restore the old run's saved definition and render its historical graph and proof unchanged. Never apply the new review rules to it. |

## Risks / Trade-offs

- **A later head has no fresh semantic review** → Show reviewed and current heads
  together, mark coverage stale, preserve dispositions, and leave judgment with
  the person at the gate.
- **Closing malformed recheck items as open can over-report concerns** → Favor
  visible uncertainty over silently clearing an item. Keep the raw result for
  diagnosis.
- **Nested review makes the author attempt more complex** → Keep each child
  call separately identified and immutable while one phase-cycle row enforces
  cardinality.
- **More context and source evidence increases R2 use** → Store large content
  once by immutable identity and keep only hashes and query fields in D1.
- **Portal support for old and new flows adds projection branches** → Branch
  by frozen definition and evidence format. Retain every selected format's read
  adapter until no live or retained run can reference it.
- **Search can leak checked context even when it cannot write** → Broker all
  egress, limit query data and destinations, return inert content, and redact
  telemetry.
- **Search or skill availability may vary by role** → Freeze the effective
  manifest before execution and fail closed when a required capability is not
  present.

## Migration Plan

1. Add review-cycle, execution-intent, child-execution, context, source,
   transcript, and legacy-classification records with additive D1 migrations.
   Keep old job and proof rows unchanged. Populate only the derived legacy
   classification table from hash-checked existing signals.
2. Add the trusted context builder, bounded child-review protocol, accepted-slot
   guards, and exact-head read-back checks. Exercise malformed, duplicate, and
   retry cases before selecting the new definition.
3. Update portal APIs and views to read both legacy and new evidence. Add the
   trusted legacy classifier and durable author-attempt transcript links. Build
   the workflow portal from the DEOS root and deploy it with its checked
   Wrangler configuration. Then read Cloudflare's active deployment back and
   prove that the expected version receives 100% of traffic. Verify the live,
   Access-protected portal renders a supported legacy empty log, nested author
   review, exact-head coverage, and the new-format transcript route. Record that
   compatible portal version in trusted control state. Selecting the new
   workflow definition must compare-and-set against this active version; upload,
   partial traffic, or local browser proof cannot satisfy the gate. Once a
   format is selected by a run, retain its read adapter through every rollback.
4. Register a new immutable workflow definition with unchanged model-route
   references. Validate its first-author, independent-review, response,
   revision, and human-gate edges. Then select it only for new runs.
5. Run a deployed canary that starts with a real provider-originated Linear
   event from a test issue and reaches the new fixed workflow definition. Prove
   the received delivery, Cloudflare Workflow, plan and design review cycles,
   D1/R2 evidence, exact pull request heads, and human-gate state. Capture the
   signed-in provider configuration, triggering issue, nested author review,
   stale-head state, and transcript empty state as visual proof. Report
   synthetic signed ingress, provider-originated delivery, durable remote
   evidence, and screenshots as separate claims; a synthetic request or passing
   test suite cannot stand in for the provider canary.
6. Roll back by selecting the prior definition for later runs. Portal
   presentation may roll back only to a build that can still read every evidence
   format already selected by a run. Existing runs continue on their frozen
   version; additive records and their read adapters remain available and need
   no destructive rollback.
