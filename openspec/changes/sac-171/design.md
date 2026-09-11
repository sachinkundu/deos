## Context

See `proposal.md` for the reason for this change. Today, authenticated Linear
start events pass through ingress and Queue handling before one guarded D1 write
allocates a run. The run then drives author and review attempts through a trusted
sandbox runner. The portal reads durable run and attempt facts from D1.

The tier choice must fit that authority model. It must come from the accepted
event, become part of the immutable run, and survive Queue replay, Workflow
replay, and agent retry. The sandbox must not hold Linear or Cloudflare
credentials. Existing route, workflow, model, review, and approval facts stay
unchanged.

The checked inputs do not define the exact Linear `Todo` webhook label shape or
the Cloudflare request value for either sandbox class. Before any parser or
adapter implementation, the owner must inspect both primary contracts. They must
trigger real labeled and unlabeled Linear test events and create a real test
sandbox of each class. Fake requests cannot prove either provider contract.

## Goals / Non-Goals

**Goals:**

- Make one auditable tier choice while the run is allocated.
- Keep that choice stable for all author, review, repair, and retry attempts.
- Give sandbox creation one closed, typed value instead of label data.
- Expose the saved choice and comparable attempt timing in the portal.
- Roll out without changing active run policy or rewriting a tier after start.

**Non-Goals:**

- Resize a running sandbox or any non-agent Cloudflare service.
- Let agents, portal clients, or later Linear events select a tier.
- Change model routes, review edges, retry limits, or human gates.
- Draw a long-term cost or speed conclusion from the first trial.

## Component Diagram

```mermaid
flowchart LR
    L[Signed Linear Todo event] --> I[Authenticated Python ingress]
    I -->|event label fact and route proof| Q[Cloudflare Queue]
    I --> D[(D1)]
    Q --> C[Trusted Queue consumer]
    C -->|atomic run allocation| D
    D -->|frozen sandbox tier| W[Cloudflare Workflow]
    W -->|run and attempt tier| R[Trusted sandbox runner]
    R -->|verified tier mapping| S[Cloudflare Sandbox]
    R -->|attempt times and outcome| D
    R -->|safe tier telemetry| O[Workers Observability]
    T[Access-protected trial setup] --> D
    D --> A[Portal API]
    A --> P[Run view and trial report]
```

Ingress derives only an event-time label fact. The Queue consumer owns the
tier policy and freezes its result with the other run facts. The Workflow and
runner consume that saved result. They never receive label-based choice logic.

## Event Flow

1. Ingress authenticates the raw Linear body and accepts the `Todo` start event
   under the existing delivery and route checks. It inspects the labels in that
   authenticated event. A label matches only when its provider name is the
   exact string `slow-ok`. There is no case folding or whitespace trimming.
2. Ingress records and queues a three-state label fact: `present`, `absent`, or
   `unavailable`. Missing, malformed, or incomplete event label data becomes
   `unavailable`. The Queue message also keeps the existing delivery identity
   and frozen route proof. Ingress does not fetch current issue labels.
3. The Queue consumer validates the route and repository rights as it does now.
   During the guarded run insert, it maps `present` to `basic`. It maps both
   `absent` and `unavailable` to `standard-2`. The same insert stores the tier
   and its selection reason with all other frozen run facts. If the issue is a
   predeclared trial member, it also binds that member to this run exactly once.
4. A duplicate delivery cannot allocate a second run. A Queue replay that finds
   the run already allocated reads its saved tier and does not evaluate label
   facts again.
5. Before any agent provider call, the runner creates the attempt row and copies
   the run tier into it. The runner rejects a missing, unknown, or mismatched
   tier. It then maps the closed internal value to the provider's verified
   sandbox class and creates the sandbox under the existing deterministic
   attempt and sandbox identities.
6. Every path that allocates a new author, review, repair, or retry sandbox uses
   the same attempt reservation path and copies the run tier. Same-sandbox author
   completion repair rounds create no attempt and keep the tier of their existing
   sandbox. No path accepts an override. A later Linear label event cannot update
   either tier field.
7. Trusted Worker time records attempt start just before the sandbox create call
   and attempt end when the attempt reaches a terminal outcome. Both tiers use
   this UTC millisecond clock, the same stage names, and the same outcome set.
   Sandbox-local clocks are not used for the comparison. Start and end
   telemetry names the run, attempt, tier, stage, and outcome with no label list.
8. Before trial events start, an Access-protected operator action stores the
   immutable pair manifest. It cannot change run selection or workflow policy.
9. The portal run endpoint returns the value from the run row. Attempt trace data
   returns each copied value. The trial report binds predeclared issue pairs to
   their runs and compares only matching workload and frozen-control digests.

## Minimal Data Model

Use a closed internal enum with values `basic` and `standard-2`. Convert those
values to the labels `Basic` and `Standard-2` only at user-facing or provider
adapter boundaries.

| Record | Field | Purpose and rule |
| --- | --- | --- |
| Accepted delivery | `start_label_fact` | `present`, `absent`, or `unavailable`, derived once from the authenticated start event. It is immutable and safe to place in the Queue message. |
| Run | `sandbox_tier` | Required closed enum. It is written in the guarded run allocation and never updated. This is the authority for later work and portal display. |
| Run | `sandbox_tier_source` | `event_slow_ok`, `event_without_slow_ok`, `event_labels_unavailable`, or `legacy_basic`. This explains the choice without storing all label names. |
| Agent attempt | `sandbox_tier` | Required copy of the run value, written before sandbox creation. A guarded insert or check prevents a different value. |
| Agent attempt | existing stage, start, end, and outcome fields | Reuse the authoritative attempt identity and lifecycle fields. Do not add a second timing record or a sandbox-reported duration. |
| Trial member | trial, pair, and issue IDs; workload and control digests; planned tier; random seed; launch order; bound run ID | Manifest fields are immutable after the pre-launch write. Guarded run allocation may set the bound run ID once. The row records assignment without affecting run authority. |

The run value is normalized data authority, while the attempt copy is deliberate
denormalization for proof and reporting. The copy lets an operator detect a bad
creation path without joining provider logs. A consistency query must find zero
attempts whose tier differs from their run.

The report includes only complete pairs whose workload digest, repository base,
workflow definition, model route, thought setting, and other frozen controls
match their manifest. For each tier and stage, it reports completed attempt count,
median elapsed milliseconds, first-pass success count, failed attempt count, and
retry count. It also reports the paired elapsed difference. A first-pass success
is the earliest attempt for one run and stage when that attempt succeeds. Failed
and later attempts stay in the sample but not in first-pass success. Empty groups
show zero and no median. Excluded pairs and reasons remain visible. The report
does not rank tiers or recommend a default.

## Decisions

### Derive a three-state fact at ingress and choose the tier at allocation

Ingress has the authenticated event body, so it is the only component that can
classify event-time label evidence without another provider read. The Queue
consumer already owns guarded run allocation, so it owns the policy that maps
that evidence to a tier. This split keeps authentication and policy separate.

The alternative was to query Linear when Queue work starts. That could observe
a later label state and would break replay stability. Another alternative was
to pass every label into the run. The three-state fact is smaller and keeps
unrelated provider data out of durable workflow state.

### Make the run tier authoritative and copy it into every attempt

The run is allocated once and already freezes route and workflow controls. The
tier belongs with those facts. Attempts copy it before any external creation so
their records prove what the runner requested. All attempt entry points use one
reservation function that accepts a run identity, not an optional tier.

The alternative was to derive the tier per attempt. That would let retries or
new review paths drift after a label change. Storing only on attempts was also
rejected because the portal could not state one authoritative run choice.

### Keep provider names behind one checked adapter mapping

Workflow code uses the closed internal enum. One sandbox adapter maps each value
to the exact Cloudflare resource class confirmed by the primary contract. An
unknown value fails before a provider request. There is no default branch in
this mapping.

The alternative was to spread provider strings through workflow nodes. That
would make policy audits and provider changes harder. Treating provider omission
as Standard-2 was rejected because an API default can change and gives weak
proof of the requested class.

### Fail closed instead of falling back to another tier

If the provider rejects or cannot supply the saved class, the attempt follows
the existing typed failure and retry path. A retry creates a new attempt with
the same run tier. It never tries the other class and never edits the run.

Automatic fallback was rejected because it would make the portal value false,
mix trial cohorts, and violate the frozen-run contract.

### Use paired randomized workloads and trusted lifecycle time for the trial

Before outcomes are visible, the operator stores an immutable trial manifest.
Each pair names two copies of the same benchmark, its workload digest, repository
base commit, workflow definition, model and control revisions, planned tier, and
randomized launch order. The Basic member has `slow-ok` before `Todo`; the
Standard-2 member does not. The pair starts in one short window. Repeated pairs
randomize tier assignment to the copies and launch order to spread concurrency
and warm-up effects.

The report binds each issue to its allocated run. It rejects or clearly excludes
a pair when workload or frozen controls differ. Trusted Worker start and end
times then produce per-tier results and paired elapsed-time differences.

An arbitrary run list or time window was rejected because issue content, base
state, concurrency, and warm-up could dominate the tier effect. Sandbox CPU time
alone was rejected because it omits startup and orchestration cost.

## Failure Modes

| Failure | Required behavior |
| --- | --- |
| Event labels are missing, malformed, or incomplete | Record `unavailable` and allocate `standard-2`. Do not query Linear for replacement facts. |
| A real labeled test event has no event-time label facts | Stop before parser implementation and revise the approach. Do not ship a path that always classifies labels as `unavailable`. |
| Event has similar text such as `Slow-Ok` or `slow-ok ` | Record `absent` because only exact provider name equality matches. |
| Delivery or Queue work is replayed | Reuse the delivery identity and saved run. Do not allocate again or recompute the tier. |
| D1 cannot atomically save the run and tier | Do not dispatch the Workflow or acknowledge successful Queue handling. Let the existing Queue retry policy retry the same delivery. |
| A run or attempt has a missing or unknown tier | Fail before sandbox creation and record a bounded internal cause. Do not guess from labels, history, or provider defaults. |
| Attempt tier differs from run tier | Reject the attempt reservation or creation. Emit safe mismatch telemetry and leave the run unchanged. |
| Cloudflare rejects or lacks the saved class | Mark the attempt through the existing typed failure path. Any allowed retry uses the same class. Never fall back. |
| Sandbox creation has an ambiguous response | Reconcile with the existing deterministic sandbox identity before retrying. A retry still uses the same saved class. |
| Attempt starts but no terminal timestamp is recorded | Keep it out of elapsed-time aggregates until existing cleanup or reconciliation gives it a terminal outcome. Show it as incomplete in trace data. |
| Portal reads a corrupt or missing tier | Show an explicit unavailable state and emit safe diagnostics. Do not infer a value from current labels or one attempt. New writes must make this state impossible. |
| A trial group is small or empty | Show the sample count and no result where needed. Do not hide failures, rank tiers, or choose a default. |

## Risks / Trade-offs

- **[The primary Linear event may not carry usable label facts]** → Prove the
  labeled and unlabeled event contract before parser work. Stop for an upstream
  decision if the contract cannot support the Basic rule. Reserve `unavailable`
  for an isolated event whose normally supplied facts are missing or malformed.
- **[Standard-2 can cost more without enough speed gain]** → Keep cohort rules,
  counts, elapsed time, outcomes, and retries visible. Make no automatic policy
  change from the report.
- **[A copied attempt field can drift from the run]** → Write it through one
  guarded reservation path and check for mismatches before provider calls and
  in operator validation.
- **[A provider API name may differ from the product label]** → Verify both real
  classes against the primary contract and isolate the mapping in one adapter.
- **[A rollback could strand Standard-2 runs]** → Keep both enum values and both
  adapter mappings supported until every such run is final.
- **[Median duration does not prove causation]** → Show the cohort controls and
  all outcome counts. Treat the report as trial evidence, not a verdict.

## Migration Plan

1. Before parser or adapter code is written, inspect the primary Linear webhook
   contract and move real test issues to `Todo` with and without the exact label.
   Confirm that the signed event contains usable event-time label facts. Also
   inspect the primary Cloudflare sandbox contract and create one real test
   sandbox of each class. If a labeled Linear event cannot supply the needed
   facts, stop and revise the plan; `unavailable` is not a substitute for a
   provider contract that never exposes labels.
2. Add nullable delivery, run, and attempt tier fields plus the trial manifest
   table. Deploy readers that understand both tier values and a temporary
   missing legacy value.
3. With Standard-2 selection still disabled, deploy compatibility writers on
   every run and attempt creation path. New runs explicitly save `basic` with
   source `legacy_basic`. New attempts copy their run value. If an active
   legacy run is still null, its writer saves and uses Basic. This release must
   already understand both tier values so later rollback remains safe.
4. Backfill pre-cutover runs and attempts to `basic` with source
   `legacy_basic`. Backfill accepted start deliveries only when their event
   fact is already provable; otherwise use `unavailable`. Never read current
   Linear labels for the backfill.
5. Check that every run has one valid tier, every attempt matches its run, and
   active pre-cutover runs remain Basic. Because all live writers now dual-write
   the tier, enforce required run and attempt values in the schema.
6. Deploy the verified ingress classifier, Queue choice, trial manifest, portal
   fields, report, and sandbox mapping while Standard-2 selection remains off.
   Test exact, absent, and unavailable label facts, duplicate delivery, Queue
   replay, every new-sandbox role, same-sandbox repair, retry, mismatch, and
   provider rejection.
7. Enable Standard-2 selection for new runs. Repeat provider-originated Linear
   checks for both label choices. Use read-only D1 evidence to prove one tier per
   run and attempt. Capture the strongest portal screenshots, and keep synthetic
   ingress proof separate from provider-originated proof.
8. Roll back by selecting Basic only for future runs. Do not rewrite existing
   runs. The rollback version must still create Standard-2 retries for runs that
   saved that tier. Keep the additive fields until all compatible versions and
   active runs are gone.
