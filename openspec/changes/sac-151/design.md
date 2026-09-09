## Context

See `proposal.md` for the motivation and the three delta specs for required
behavior. The current architecture gives every top-level attempt a sealed
Sandbox, UUIDv7 identity, pinned supervisor, frozen workflow definition,
D1-backed authority, and hash-checked R2 evidence. It separates deterministic
artifact validation, semantic self-check, trusted publication, independent
review, and human approval.

This change moves only plan and design self-check execution into the active
author's Sandbox. The author session must survive check, repair, and recheck,
while every reviewer remains a fresh, read-only child execution. The Sandbox
has no GitHub or Linear credential. Provider writes, independent review, and
human gates remain outside it.

A shared Sandbox is not permission to share process state. The pinned
supervisor isolates author and reviewer lanes with kernel-enforced credentials
and namespaces. It executes the phase-specific review contract frozen for the
run rather than substituting one generic review topology. Planning discovery
uses two mutually blind directional sessions followed by the link reconciler.
Design discovery uses one fresh design-review session over the complete design
candidate and design rubric. A design recheck uses one new design-recheck
session over that candidate and the fixed finding inventory. Each topology has
its own prompt, input projection, schema, validator, and result adapter.

## Goals / Non-Goals

**Goals:**

- Keep one plan or design author session alive for the complete private
  self-check and repair loop.
- Interpret each check and recheck solely from its frozen review-session plan,
  preserving session count, dependencies, blindness, schemas, adapter, and
  semantic slot.
- Give every launched reviewer a distinct child identity, fresh model session,
  enforceable process boundary, immutable checked candidate, and read-only
  tools.
- Give every request, preflight fault, execution, reuse decision, and accepted
  stop durable and replayable identity before cleanup.
- Recover abandoned work without duplicate model calls, concurrent reviewers,
  or extra semantic turns.
- Preserve candidate-based identical-input reuse across top-level retries and
  preserve the existing reducer's finding rules, three-repair limit, and stop
  outcomes.

**Non-Goals:**

- Running independent review or human approval inside the author Sandbox.
- Giving an author or reviewer provider capabilities.
- Changing a phase's topology, prompt, model, result schema, finding identity,
  reconciliation rules, repair limit, turn limit, or stop policy.
- Keeping reviewer state across rechecks or exposing a sibling result unless
  the frozen plan explicitly declares that dependency.
- Running author edits concurrently with a reviewer.
- Treating a cgroup by itself as a security or filesystem-isolation boundary.

## Component diagram

```mermaid
flowchart LR
    W[Cloudflare Workflow<br/>frozen definition] --> C[Trusted Worker<br/>loop and lease authority]
    C <--> D[(D1 requests, leases,<br/>executions, reuse)]
    C --> S[Author Sandbox<br/>one top-level attempt]
    S --> P[Pinned supervisor<br/>privileged review broker]
    P --> AL[Author lane<br/>author UID and namespaces]
    AL --> A[Live author session]
    A -->|opaque checked receipt<br/>and review request| P
    P --> PF[Durable request<br/>and fenced preflight]
    PF --> F[Immutable snapshot<br/>checked candidate bytes]
    C --> RP[Frozen phase-specific<br/>review-session plan]
    RP --> PI[Plan interpreter]
    P --> PI
    F --> PI
    PI --> RS[Fresh reviewer lanes<br/>exactly as declared]
    RS --> PA[Plan-selected validator<br/>and adapter]
    PA --> SR[Existing semantic reducer]
    SR -->|bounded findings| A
    P --> E[(Create-only R2 evidence)]
    E --> C
    SR -->|accepted stop only| T[Trusted publication]
    T --> I[Independent review]
    I --> H[Human approval]
```

The trusted Worker owns request identity, D1 state transitions, leases, reuse,
and semantic reduction. The pinned supervisor is the only privileged Sandbox
process. It owns process isolation, author quiescence, snapshot creation, plan
execution, tool brokerage, and evidence staging. The author can request the
configured check and receive a validated result, but cannot choose the plan,
child configuration, context, model, tools, schema, adapter, or retry allowance.

## Decisions

### 1. Run author and reviewers in supervisor-owned OS isolation lanes

The supervisor exposes one bounded `start_self_review` operation. Trusted code
accepts it only after deterministic checks create an opaque, create-only
checked-candidate receipt and no conflicting request is active. A reviewer is
a child of the current `author_attempt_id`; it never creates a Workflow visit,
top-level attempt, writable checkout, or new Sandbox.

The author runs as a dedicated unprivileged user in PID, mount, IPC, and network
namespaces. Its writable checkout exists only in that mount namespace. All
author descendants remain in a non-delegated cgroup. The author cannot create
or join cgroups or namespaces. `no_new_privs` is set; ambient and inheritable
capabilities are empty; cross-boundary capabilities such as `CAP_SYS_ADMIN`,
`CAP_SYS_PTRACE`, `CAP_KILL`, `CAP_DAC_OVERRIDE`, and `CAP_DAC_READ_SEARCH` are
absent from the bounding set. Seccomp denies tracing, cross-process memory
access, and namespace-changing calls outside the author tool contract.

Each declared reviewer session gets a new unprivileged UID/GID, PID, mount,
IPC, and network namespace, cgroup, root filesystem, child ID, and model-session
ID. Its root is read-only except for a bounded private tmpfs used by the model
harness. It sees only the immutable candidate snapshot, canonical envelope,
declared dependency results, and frozen-plan tools. It cannot see the live
checkout, author state, sibling roots, process trees, supervisor staging, or
provider capabilities. Neither lane has direct network egress; only
supervisor-owned, attempt-scoped model and tool channels are reachable.

Supervisor sockets, result pipes, model channels, and evidence staging are
absent from unprivileged mount namespaces. Reviewer output crosses a framed,
supervisor-owned channel that cannot address another process.

Before reading candidate bytes, the supervisor freezes the complete author
cgroup and verifies its process inventory. Launch evidence records namespaces,
UID/GID, capability sets, seccomp digest, cgroup membership, process inventory,
and mount-policy digest. A missing control or an author process outside the
lane creates a durable non-consuming preflight fault; no reviewer starts.

The author stays frozen until all plan-declared sessions close, post-run checks
finish, and child processes are reaped. The supervisor removes the snapshot,
thaws the same author session, and returns an accepted result. Repair must pass
deterministic checks again. Recheck uses a new request when candidate or input
changes and fresh session identities unless verified identical-input reuse
applies.

Alternative considered: use only cgroups and brokered paths. Cgroups freeze and
account for processes but do not prevent signaling, tracing, or filesystem
access, so they are not a complete security boundary.

Alternative considered: let the author spawn arbitrary subagents. That would
make process configuration, model, context, tools, and evidence depend on
untrusted author output.

### 2. Interpret the frozen phase-specific review plan exactly

The trusted Worker builds the same complete self-check input and immutable
`ReviewSessionPlan` used by the separate-Sandbox flow. The digest-bound plan
contains:

- phase, discovery or recheck mode, semantic slot, and fixed finding inventory
  where applicable;
- ordered session declarations with stable keys, dependency edges, visibility
  rules, role, prompt, model settings, tools, input projection, and schema;
- execution mode, including blindness and allowed concurrency;
- required-session and completion predicates;
- exact validator and adapter or reconciler identity and configuration; and
- review, result, retry, limit, and stop-policy revisions.

The Sandbox interpreter may launch only declared sessions, expose only declared
dependencies, validate each result with its declared schema, and call only the
declared adapter after the completion predicate holds. Unknown revisions,
session types, schemas, adapters, dependency cycles, or impossible visibility
rules fail closed before model allocation. The interpreter must not infer a
topology from the phase name.

The current phase shapes are explicit:

| Phase and mode | Sessions and visibility | Completion and adapter |
|---|---|---|
| Planning discovery | `proposal_first` and `requirement_first`; both receive the same immutable plan inventory and neither sees the other's output | Both valid results are required; the planning link reconciler produces the existing directional claim set and finding inventory. |
| Planning recheck | The frozen planning-recheck declarations; every session receives only its declared projection and the immutable discovery inventory | The declared recheck validator must rate the full fixed inventory before the planning adapter emits the existing result. |
| Design discovery | One `design_review` session receives the complete immutable `design.md`, approved plan context, architecture guide, and design rubric | One schema-valid result is required; the design adapter emits the existing findings or pass shape without link reconciliation. |
| Design recheck | One new `design_recheck` session receives the repaired immutable design, same checked context, and complete fixed design-finding inventory | The recheck validator requires exactly one rating for every existing finding ID; the design adapter emits the existing recheck result. |

The table documents the currently frozen contract; the plan remains authority.
A later reviewed workflow definition may declare a different design topology,
but an active run cannot synthesize or normalize it. Planning's two discovery
sessions remain blind even when executed sequentially. Design review never
uses the planning link reconciler. Rechecks never fall back to discovery.

For every session, the supervisor creates a canonical `ReviewLaunchEnvelope`
containing request, execution, parent attempt, session key, child and model
identities; trusted change context; candidate and snapshot identities; prompt,
model, tools, projection, schema, dependencies, visibility; and all contract
digests. Every child starts with no forked turns, author transcript, parent
model state, unsaved notes, or undeclared sibling results. A launch receipt
records the envelope digest, model identity, `parent_context_included: false`,
declared sibling inputs, OS-isolation proof, and configuration digests.

Only after all required sessions close does the selected adapter produce the
existing phase result. Missing sessions, undeclared information flow, invalid
output, or a wrong adapter rejects the review before semantic reduction.

Alternative considered: always launch the two planning directions. That is
correct for planning discovery but overrides design and recheck contracts.

Alternative considered: fork the author's conversation and tell the reviewer
to ignore it. Instructions cannot prove fresh context.

### 3. Bind every review to its deterministic checked candidate

Each successful deterministic check writes a receipt with candidate ID, phase
inventory, ordered paths, byte lengths and SHA-256 values, aggregate manifest
SHA-256, candidate SHA-256, check-policy revision, and validation result. The
author receives only the opaque receipt identity.

The Worker derives and inserts the attempt-local request from that receipt and
canonical review input before Sandbox isolation, freeze, or snapshot work.
Every later fault is therefore attributable to a durable request. The
supervisor claims a fenced preflight and freezes the author cgroup.

Trusted code then enumerates the live tracked scope with the same inventory
builder. It must exactly equal the checked receipt. A mismatch records
`stale_checked_candidate` with locatable proof, starts no child, thaws the
author, and requires a fresh deterministic check. On equality, the supervisor
copies the exact frozen bytes to a content-addressed, supervisor-owned snapshot
and independently proves snapshot equality with both checkout and receipt.
Reviewers never read the live checkout.

Immediately before and after every reviewer session, the supervisor enumerates
the snapshot and live tracked scope while the author remains frozen. Acceptance
requires identical ordered paths, lengths, and hashes across every receipt and
manifest. Any missing, added, or changed path creates a non-consuming
file-integrity fault. Read-only tools and mounts prevent mutation; manifest
equality controls acceptance.

Alternative considered: compare only before/after manifests. They could agree
even if bytes changed after deterministic validation but before freezing.

Alternative considered: mount the live checkout read-only for reviewers. That
couples review reads to mutable author state and weakens candidate identity.

### 4. Separate request, preflight, execution, replay, and reuse identities

Trusted code derives `review_request_id` before preflight from run, author
attempt, phase, semantic slot, checked receipt, canonical input digest, and
contract revision. A guarded D1 insert serializes lost responses and concurrent
calls within the attempt. An existing request is returned, not recreated.

Every preparation attempt has `preflight_id` and ordinal. Isolation,
quiescence, stale-candidate, snapshot, and other pre-execution faults attach to
that record. Its create-only R2 proof is locatable by exact key, byte length,
and SHA-256 stored in D1.

`review_reuse_key` excludes `author_attempt_id` and instead binds run and trusted
change, phase, candidate and inventory digests, canonical input digest,
finding-inventory digest, semantic slot, and complete contract digest. After
the current preflight proves checkout and snapshot equality, the Worker may
look up an accepted source by this key. It verifies source receipt, every file
hash, result digest, semantic slot, contract, and source evidence by exact R2
key, length, and SHA-256.

Successful reuse creates an attempt-local request and `self_review_reuse`
binding but no execution, model call, Sandbox, or counter increment. The
attempt-specific reuse-validation receipt is a canonical create-only R2 object.
D1 stores its key, byte length, SHA-256, and source evidence identity. Final
completion reads that exact object back and verifies it.

If reuse does not apply, the controller allocates an execution under the
request. Replay alone cannot increment its retry ordinal. Only the reducer or
typed infrastructure recovery policy can authorize a later execution after a
rejected or abandoned one. A repair changes candidate or input and therefore
creates a new request and reuse key.

Alternative considered: include the attempt in the only identity. That handles
local replay but prevents identical-input reuse after a top-level retry.

Alternative considered: omit the attempt from every identity. That permits
reuse but cannot serialize or audit one attempt's request.

### 5. Fence live work and reconcile abandoned work

Every preflight and execution uses a D1 compare-and-set lease with
`lease_owner`, monotonic `fence_epoch`, `lease_expires_at`, and `heartbeat_at`.
Every supervisor command, model channel, evidence write, and state transition
carries the epoch. D1 and the supervisor reject late work from an older epoch.
Lease expiry triggers reconciliation; it does not authorize an immediate
second reviewer.

The recovery path reads the durable record, Sandbox identity, process
inventory, model-channel state, and staged or durable evidence:

1. If complete hash-checked evidence proves a valid result, finish validation
   and indexing under the same identity without another model call.
2. If a preflight provably ended before any child or model channel allocation,
   fence it, mark it `abandoned`, save bounded proof, and allow the next
   preflight ordinal only when typed policy permits.
3. If a child or model call started, or start is ambiguous, revoke its model and
   tool channels, stop child processes, obtain a terminal or canceled broker
   acknowledgement, and prove no process or channel remains. Then mark the
   execution `abandoned`; only typed policy may allocate a fresh execution and
   identities.
4. If termination and quiescence cannot be proved, launch no replacement.
   Reject the parent attempt and retain the Sandbox for proof repair.

Abandoned work never reaches the reducer, consumes a turn, or becomes a reuse
source. An old owner cannot publish evidence, accept a result, renew, or thaw
the author under a newer fence. If the author died, recovery may preserve proof
but cannot attach the child to a different top-level attempt. Frozen lease and
retry limits cannot extend the 24-hour top-level attempt bound.

Alternative considered: take over immediately at lease expiry. The old model
call may still run, so expiry alone cannot prove duplicate work is safe.

### 6. Preserve the existing semantic reducer and explicit recheck bounds

After plan, OS/context isolation, tool policy, candidate equality, session
integrity, completion, adapter, and schema checks pass, the interpreter submits
the phase result to the existing reducer. The reducer remains sole authority
for finding IDs, accepted findings, pass, judgment, counters, and stop results.
Executor location, preflight count, and infrastructure recovery are not
semantic inputs.

The current self-check contract permits at most three author-repair turns after
discovery. Each accepted finding result consumes the same semantic turn it
would consume in the separate-Sandbox flow; rejected or abandoned
infrastructure work consumes none. The fourth repair is never offered. If a
finding remains after the third repair, the reducer emits the existing limit
stop with the unchanged finding and proof.

Discovery creates one immutable finding inventory. Every recheck must rate
every existing inventory ID exactly once. It cannot add, remove, rename, merge,
or split a finding. The trusted validator compares the returned ID multiset to
the saved inventory before reduction; any duplicate, omission, or unknown ID
rejects the result without changing the inventory or consuming a semantic
turn. A valid recheck may only update the allowed per-finding rating and
evidence fields defined by the frozen schema.

For findings, the reducer sends that same bounded inventory to the live author.
For pass, limit, or judgment, it emits the same accepted stop record as the old
flow. Malformed, partial, rejected, abandoned, or wrongly aggregated output
cannot become a semantic result.

Alternative considered: keep the numeric bound and inventory rules implicit in
the reducer. That would preserve runtime behavior but leave implementation and
verification unable to check the in-Sandbox path as a standalone design.

Alternative considered: implement counters in the supervisor. Duplicating
semantic policy would allow local execution to diverge from the frozen flow.

### 7. Persist locatable proof before completing the author attempt

Each preflight and execution writes a create-only R2 evidence bundle. Execution
evidence includes the checked receipt, frozen plan, launch envelopes, freshness
and OS-isolation receipts, manifests, tool audits, lease/fence history, session
outputs or faults, adapter result, and validation receipt. The Worker indexes a
bundle only after reading it back and matching exact key, byte length, and
SHA-256. D1 stores those fields on the owning record.

Reuse writes a separate attempt-specific validation object with its exact key,
length, and digest on the reuse row. It references, rather than copies, the
source accepted execution evidence.

At an allowed stop, D1 binds the final request and accepted review to the parent
attempt. The Worker reads back the result and every required preflight,
execution, or reuse reference. Only verified closure permits author completion
and normal Sandbox cleanup. Storage or read-back failure rejects the attempt
and enters the existing retention path for proof repair.

Trusted publication consumes only the accepted stop and checked candidate. It
remains outside the Sandbox. Independent review runs later in a fresh stage,
and human approval remains bound to a separate gate visit.

Alternative considered: store only reviewer text or evidence digests. Text
cannot prove isolation or immutability, and an unlocated digest cannot be read
back or audited.

## Event flow

1. The author writes a private plan or design draft. The supervisor runs the
   phase-specific deterministic checks and stores the checked-candidate receipt.
2. The author requests the configured self-check with the opaque receipt. The
   Worker loads the frozen review plan, derives attempt-local request and reuse
   identities, and inserts or reads the D1 request before preflight.
3. The controller claims a fenced preflight. The supervisor freezes the author
   lane and proves credentials, namespaces, capabilities, seccomp, mounts,
   cgroup, protected channels, and process inventory.
4. The supervisor requires the frozen checkout to equal the receipt, creates an
   immutable snapshot, and proves equality. A mismatch starts no child and
   records a non-consuming preflight fault.
5. After equality proof, the Worker may accept identical-input reuse. It
   verifies source candidate, contract, result, and R2 object, then writes and
   reads back the attempt-specific reuse object. Valid reuse removes the
   snapshot, thaws the author, and returns the result without a model call or
   counter change.
6. Otherwise, the controller claims a fenced execution. The interpreter
   validates and launches exactly the frozen plan's declared sessions. Planning
   discovery launches the two blind directions; design discovery launches one
   `design_review` session; design recheck launches one fresh `design_recheck`
   session with the complete fixed inventory.
7. Before and after each session, the supervisor records snapshot and checkout
   manifests while the author remains frozen. Each child receives only its
   envelope, snapshot, declared dependencies, and read-only tool profile.
8. When the plan completion predicate holds, its declared validator and adapter
   produce the existing phase result. The supervisor validates isolation,
   visibility, manifests, tools, schema, plan, and fencing proof.
9. Invalid or abandoned infrastructure work is saved without a semantic turn.
   Expired work follows fenced reconciliation; no replacement launches until
   old processes and channels are proved absent.
10. For accepted findings, the reducer records one of at most three repair
    turns and sends the unchanged bounded inventory to the same author. The
    author repairs, reruns deterministic checks, and requests a fresh recheck.
    That recheck must rate every saved ID exactly once and cannot add, remove,
    rename, merge, or split findings.
11. For pass, the third-repair limit, or judgment, the Worker writes and reads
    back all locatable proof, binds the accepted stop, and permits cleanup.
12. Trusted publication posts checked artifacts and records its receipt.
    Independent review and human approval continue in separate stages.

## Minimal data model

Existing run, top-level attempt, candidate, accepted-review, and provider
operation records remain authoritative. Child sessions never enter the
top-level attempt relation.

| Record | Minimal fields | Purpose |
|---|---|---|
| `self_review_loop` | `run_id`, `author_attempt_id`, `phase`, `revision`, `turns_used`, nullable `stop_result`, nullable `final_review_request_id` | Serializes one phase loop. The reducer owns counters and stops, including the three-repair maximum. |
| `self_review_request` | `review_request_id`, `review_reuse_key`, `run_id`, `author_attempt_id`, `phase`, `semantic_slot`, `candidate_id`, `candidate_sha256`, `checked_manifest_sha256`, `input_sha256`, `session_plan_sha256`, nullable `finding_inventory_sha256`, `contract_revision`, `state`, nullable `accepted_execution_id`, nullable `reused_from_request_id`, timestamps | Provides attempt-local replay and exists before preflight. |
| `self_review_preflight` | `preflight_id`, `review_request_id`, `ordinal`, `state`, `lease_owner`, `fence_epoch`, `lease_expires_at`, `heartbeat_at`, nullable `fault_code`, nullable `evidence_r2_key`, nullable `evidence_byte_length`, nullable `evidence_sha256`, timestamps | Gives all pre-execution work durable identity and locatable proof. `(review_request_id, ordinal)` is unique. |
| `self_review_execution` | `review_execution_id`, `review_request_id`, `preflight_id`, `retry_ordinal`, `state`, `lease_owner`, `fence_epoch`, `lease_expires_at`, `heartbeat_at`, `counts_as_turn`, nullable `semantic_turn`, nullable `result_sha256`, nullable `fault_code`, nullable `evidence_r2_key`, nullable `evidence_byte_length`, nullable `evidence_sha256`, timestamps | Records one plan execution, fenced ownership, result, and proof. `(review_request_id, retry_ordinal)` is unique. |
| `self_review_session` | `subagent_id`, `review_execution_id`, `author_attempt_id`, `phase`, `session_key`, `launch_seq`, nullable `direction`, `model_session_id`, `input_projection_sha256`, `schema_sha256`, `visibility_sha256`, `os_isolation_sha256`, `envelope_sha256`, `state`, nullable `result_sha256`, nullable `fault_code`, timestamps | Correlates each plan-declared fresh session without assuming topology. `(review_execution_id, session_key)` and `(author_attempt_id, phase, launch_seq)` are unique. |
| `self_review_reuse` | `review_request_id`, `review_reuse_key`, `source_request_id`, `source_execution_id`, `source_evidence_r2_key`, `source_evidence_byte_length`, `source_evidence_sha256`, `validation_r2_key`, `validation_byte_length`, `validation_sha256`, `created_at` | Audits cross-attempt identical-input reuse and locates its validation proof. |
| R2 evidence objects | checked receipt; preflight or execution envelope; frozen plan; fencing history; OS/context receipts; manifests; tool audits; session results or faults; adapter result; reuse validation | Hold immutable detailed proof at the exact key, length, and SHA-256 indexed by D1. |

Request state is `allocated`, `preparing`, `executing`, `accepted`, `reused`, or
`rejected`. Preflight and execution state is `allocated`, `running`,
`validating`, `accepted`, `rejected`, or `abandoned`. Session state is
`allocated`, `running`, `accepted`, `rejected`, or `abandoned`.
`counts_as_turn` is written only by the reducer. `semantic_turn` is null before
semantic acceptance. A reused request has no new execution row.

No prompt bodies, provider credentials, author transcript, hidden model state,
or unsaved notes are stored in D1. Stable digests identify allowlisted
configuration; hash-checked R2 objects hold bounded evidence.

## Failure modes

| Failure | Required behavior |
|---|---|
| Request insertion fails before preflight | Start no Sandbox work and return the existing infrastructure failure; there is no unattributed execution. |
| Required namespace, credential, capability, seccomp, mount, cgroup, or channel isolation cannot be established | Save a non-consuming preflight fault and use existing infrastructure policy. Never fall back to cgroups alone. |
| The supervisor cannot freeze every author process | Save a non-consuming quiescence fault and start no reviewer. |
| Frozen checkout differs from the checked receipt | Save `stale_checked_candidate` with locatable proof, thaw the author, and require a new deterministic check. Do not review or reuse old bytes. |
| Snapshot differs from frozen checkout | Save a non-consuming snapshot-integrity fault and start no reviewer. |
| Frozen plan is unknown, invalid, or requires an unavailable schema or adapter | Reject before model allocation and store plan-validation proof. Do not substitute a generic topology. |
| Design discovery or recheck does not match its one-session declaration | Reject before reduction; do not use the planning topology or adapter. |
| A session cannot start or its context is not fresh | Save a launch or context-isolation fault, accept no partial result, and follow existing retry/stop policy. |
| A blind session sees undeclared sibling output | Reject the execution, save visibility proof, and do not invoke the adapter. |
| A required session is absent, has the wrong schema, or uses the wrong adapter | Reject the execution and do not infer a partial result. |
| The author exits while a child runs | Fence and stop the child, retain proof, and fail the parent. Never convert the child into a top-level attempt. |
| Author can see, signal, trace, or read reviewer/supervisor resources | Reject as an OS-isolation fault and fail closed before reduction. |
| Reviewer reads forbidden parent or sibling state | Deny the read, record a tool-policy fault, and reject the execution. |
| Reviewer requests provider access | Deny it, record the capability and safe target class, and reject without external effect. |
| Any receipt, checkout, or snapshot manifest differs | Save all manifests and a non-consuming file-integrity fault; do not reduce the result. |
| Reviewer output is malformed or incomplete | Save the bounded invalid result and follow current proof-repair/failure policy; never infer from free text. |
| Recheck omits, duplicates, adds, removes, renames, merges, or splits a finding ID | Reject before reduction, preserve the fixed inventory unchanged, and consume no semantic turn. |
| Author requests a fourth repair | Emit the existing three-repair limit stop; do not launch another recheck. |
| Request is replayed while its owner is healthy | Return durable state. Do not allocate another preflight, execution, model call, or turn. |
| Preflight or execution lease expires | Reconcile proof and live state; replace work only after old processes/channels are absent and typed policy permits. |
| Complete evidence exists after owner death | Validate and index it under the original identity instead of repeating the model call. |
| Started work cannot be proved terminated | Start no replacement, reject the parent, and retain the Sandbox for proof repair. |
| Late fenced owner sends a result or heartbeat | Reject it by fence epoch and record the stale-owner event without changing accepted state. |
| Accepted reuse fails candidate, contract, result, or source-object verification | Refuse reuse, save a locatable fault, and enter proof-repair/failure policy. Do not launch under ambiguous proof. |
| Reuse object cannot be written or read by key, length, and hash | Do not accept reuse or complete the attempt. |
| Top-level retry has a new attempt but identical checked input | Create an attempt-local request and verified reuse binding; create no execution, model call, or turn. |
| Rejected or abandoned execution needs retry | Only typed reducer or recovery policy may advance `retry_ordinal`; replay cannot create allowance. |
| Author repair fails deterministic checks | Resume only while a repair allowance remains; launch no reviewer for invalid bytes. |
| Semantic judgment or limit stop is reached | Emit the unchanged stop and proof; local execution grants no extra turn. |
| R2 write/read-back/checksum or D1 indexing fails | Do not accept the author attempt or clean up; enter existing proof repair/failure. |
| Sandbox heartbeat or absolute lifetime expires | Apply existing top-level failure and cleanup; child recovery cannot extend 24 hours. |
| Trusted publication fails after valid self-check | Preserve accepted private proof and use existing publication reconciliation; reviewer never publishes. |

## Risks / Trade-offs

- [One Sandbox is a weaker physical boundary than two] → Put the privileged
  supervisor outside distinct author and reviewer namespaces, drop
  capabilities, apply seccomp, protect channels, use immutable mounts, and
  persist proof of every control.
- [A kernel or supervisor defect could cross the shared host boundary] → Fail
  closed on isolation mismatch, retain workflow rollback, and keep independent
  review outside the author Sandbox.
- [Keeping the author alive consumes capacity longer] → Execute only the frozen
  topology and retain heartbeat, timeout, stop limits, and cleanup.
- [Candidate bytes can change between validation and review] → Freeze the full
  author lane and compare checkout and snapshot to the checked receipt before
  launch and around every session.
- [Negative context-isolation claims are hard to audit] → Construct each child
  from one envelope, deny undeclared paths, and persist model, namespace,
  capability, mount, channel, and visibility receipts.
- [A generic interpreter could normalize phase topology] → Treat sessions and
  adapter as digest-bound data, fail unknown declarations, and test planning
  and design discovery and recheck fixtures independently.
- [Lease recovery could duplicate a running model call] → Fence commands and
  results, revoke channels, prove process absence, and fail the parent when
  termination is ambiguous.
- [Cross-attempt reuse could accept stale proof] → Scope its key to complete
  checked input and contract, verify source objects, and store a locatable
  attempt-specific receipt.
- [Child identities may look like attempts] → Carry `author_attempt_id` and
  `subagent_id` while keeping sessions out of the attempt table.
- [Serialization prevents concurrent author work] → Accept it because exact
  candidate binding and attributable integrity proof require quiescence.

## Migration Plan

1. Add request, preflight, execution, session, and reuse records with lease
   fences and exact R2 key, length, and SHA-256 fields. Keep existing attempt
   and accepted-review readers unchanged.
2. Start author sessions in the isolation lane. Verify writes, model access,
   descendant containment, namespace visibility, denied signaling/tracing,
   capability bounds, seccomp, and supervisor-only channels.
3. Insert requests before preflight. Add checked-candidate equality, immutable
   snapshots, and locatable evidence for early faults.
4. Add the frozen-plan interpreter. Exercise planning discovery's two blind
   directions and reconciler, planning recheck, design discovery's single
   `design_review` session, and design recheck's single fresh `design_recheck`
   session as separate fixtures. Prove session count, dependencies, blindness,
   schemas, adapter, and result shape match the old executor.
5. Route adapter output through the existing reducer. Test pass, findings,
   repair/recheck, judgment, the three-repair limit, exact fixed-inventory ID
   coverage, denied provider access, signaling/tracing, mutation, missing
   session, wrong adapter, malformed output, and evidence failure.
6. Add fenced recovery tests for death before allocation, during a model call,
   completed-but-unindexed evidence, stale-owner results, unprovable
   termination, and authorized retry. Prove none creates concurrent work or an
   extra semantic turn.
7. Add attempt-local replay and cross-attempt identical-input reuse. Verify
   source evidence and the new reuse object by R2 key, length, and SHA-256.
8. Register a new immutable workflow definition selecting the in-Sandbox
   executor for plan and design self-check nodes. Older frozen definitions keep
   their separate review Sandboxes.
9. Canary with real Cloudflare Sandbox execution. Verify one Sandbox and
   top-level attempt span author, check, and repair; phase-specific topologies
   run exactly; every session is fresh and isolated; snapshot hashes match;
   the three-repair and fixed-inventory rules hold; recovery is fenced; reuse
   proof is locatable; evidence reads back; cleanup follows proof; and
   independent review remains separate. This is real Sandbox execution proof,
   not a provider-originated ingress claim.
10. Enable the new definition only for later runs after the canary passes.
    Never migrate an active loop between executor types.

Rollback selects the prior registered workflow definition for later runs.
Because definitions are frozen per run, an active new-version run completes
under this design or fails closed through existing top-level recovery; it never
switches executor mid-loop. Additive records and evidence remain readable after
rollback.
