# DEOS and BettaView Traceability Integration Handover

Status: architecture study only  
Prepared: 2026-08-25  
Repositories studied:

- DEOS: `/Users/sachin/code/deos`
- Active DEOS implementation worktree: `/private/tmp/deos-sac127-implementation`
- BettaView: `/Users/sachin/code/bettaview`

No DEOS files, deployments, provider records, branches, or pull requests were changed during this study.

## Purpose

Fit BettaView's evidence-backed OpenSpec traceability review into DEOS so that:

1. the OpenSpec planning agent can check its own proposal and delta specifications before publication;
2. the original planning agent can repair a bounded set of review findings;
3. a later reviewer using a different model can independently review the published pull request;
4. subsequent reviews verify only the original findings instead of continually creating new work;
5. every author and reviewer output is preserved durably;
6. the exact reviewed pull-request head can be visualized in the DEOS portal; and
7. GitHub and Linear link to that visualization without receiving raw provider credentials from a Sandbox.

## Snapshot of current DEOS work

Refresh both worktrees before using this snapshot because the implementation branch is active.

At the end of this study:

- `/Users/sachin/code/deos` was on `codex/simplified-planning-workflow-design` at `71a5a18`.
- `/private/tmp/deos-sac127-implementation` was on `codex/simple-todo-agent-handoff` at `1571d71` and matched its remote branch.
- The implementation worktree contained only its existing untracked `portal/dist/` output.
- The active OpenSpec task list was complete through task 17, including the successful planning-workflow proof and full repository paths for planning publication.

The simplified workflow currently contains one planning agent followed immediately by human review:

```text
claim_issue
  -> openspec_planning
  -> planning_review
  -> merge_planning_pr
  -> verify_planning_merge
```

The planning job has `github.publish_planning_work_product`, and its prompt requires publication before it may return `completed`. Therefore, the current graph cannot perform an internal pre-publication traceability check.

Primary current files:

- `/private/tmp/deos-sac127-implementation/config/workflow.simple.yaml`
- `/private/tmp/deos-sac127-implementation/config/prompts/openspec-planning.md`
- `/private/tmp/deos-sac127-implementation/src/workflow-definition.ts`
- `/private/tmp/deos-sac127-implementation/src/sandbox-controller.ts`
- `/private/tmp/deos-sac127-implementation/container/supervisor.mjs`
- `/private/tmp/deos-sac127-implementation/src/job-inputs.ts`
- `/private/tmp/deos-sac127-implementation/src/artifact-collector.ts`
- `/private/tmp/deos-sac127-implementation/src/planning-store.ts`
- `/private/tmp/deos-sac127-implementation/portal/src/worker.ts`
- `/private/tmp/deos-sac127-implementation/portal/src/model.ts`

## Existing DEOS capabilities that should be reused

DEOS already provides most of the required execution and evidence boundaries:

- A fresh Cloudflare Sandbox and repository checkout for each agent attempt.
- A pinned supervisor that runs Codex, records JSONL, maintains a heartbeat, captures the cumulative patch, and enforces the attempt deadline.
- Protected rendered prompts stored in R2 with SHA-256 read-back.
- Create-only R2 artifacts and D1 artifact manifests.
- Durable prior-attempt results and cumulative patch restoration.
- D1 records joining a run to its repository, planning branch, pull request, exact head SHA, and planning manifest digest.
- Trusted Worker-side GitHub App and Linear adapters.
- Attempt-scoped capability tokens rather than provider credentials inside Sandbox.
- Cloudflare Workflow orchestration with human gates driven by Linear events.
- An Access-protected Worker portal configured at `deos.voxdez.com`.

These facilities should own the traceability lifecycle. Do not build a second orchestration or storage system inside BettaView.

## Existing BettaView capabilities that should be extracted

BettaView already implements the semantic judge and deterministic acceptance boundary:

- It inventories `proposal.md` and the declared `specs/<capability>/spec.md` files.
- It supplies immutable, line-numbered document snapshots to the judge.
- It records SHA-256 for every reviewed document.
- It requires an explicit Codex model and reasoning effort.
- It runs the judge ephemerally and read-only.
- It converts model-selected line identities into exact quotations and complete requirement ranges.
- It validates capability/spec correspondence, complete proposal coverage records, one reverse record per requirement, bidirectional adjacency, paths, hashes, ranges, and quotations.
- It publishes `bettaview-traceability.json` only after deterministic validation succeeds.
- It can load the accepted evidence against an exact pull-request head and render it as proposal/spec citations.

Primary current files:

- `/Users/sachin/code/bettaview/src/review-traceability.js`
- `/Users/sachin/code/bettaview/src/traceability.js`
- `/Users/sachin/code/bettaview/bin/materialize-traceability.js`
- `/Users/sachin/code/bettaview/bin/traceability.js`
- `/Users/sachin/code/bettaview/prompts/openspec-semantic-traceability-bidirectional-v2.md`
- `/Users/sachin/code/bettaview/prompts/openspec-semantic-traceability-bidirectional-v2.schema.json`
- `/Users/sachin/code/bettaview/server/traceability.js`
- `/Users/sachin/code/bettaview/src/traceability-view.js`
- `/Users/sachin/code/bettaview/.agents/skills/review-openspec-traceability/references/claims.md`

Preserve the product boundary: the validator proves that cited evidence, document versions, parsed inventory, and the two-way mapping are structurally current and internally consistent. Coverage, scope, minimality, semantic similarity, and finding resolution remain model judgments.

## Recommended target workflow

```text
Linear issue
  -> claim and allocate planning identity
  -> planning draft                     [author model]
  -> internal trace discovery           [same model, fresh context]
  -> planning repair                    [author model]
  -> internal closed-set recheck        [same model]
  -> trusted planning PR publication
  -> independent trace discovery        [different model]
  -> planning repair on the same PR     [original author model]
  -> independent closed-set recheck     [same independent reviewer model]
  -> Human Review in Linear
  -> trusted merge
  -> exact merge verification
```

The loops must be bounded by workflow policy. A reasonable controlled-trial default is two semantic repair rounds for the internal reviewer and two for the independent reviewer.

BettaView's existing `maxRepairs` setting is different. It repairs a structurally invalid traceability candidate. It does not repair the proposal or specification semantics. Preserve both bounds separately.

## Meaning of an internal self-check

The author should have access to BettaView's review result, but the outer author process should not directly launch a nested Codex reviewer.

Instead, DEOS should launch a separate traceability attempt with:

- a fresh Sandbox and Codex context;
- the same configured model and reasoning effort as the author;
- read-only repository authority;
- no GitHub or Linear mutation capability;
- the candidate patch restored from R2;
- BettaView's versioned judge prompt, schema, materializer, and validator; and
- all outputs collected through the normal DEOS artifact mechanism.

The next author attempt receives the accepted traceability result as an explicit input. This is operationally a self-check while retaining independent context, reliable cancellation, durable evidence, and clean credential ownership.

A future `deos-traceability` tool may make this feel like a tool call to the author, but the tool should request a controller-owned review attempt rather than spawning a nested Codex process inside the author session.

## Separate authoring from publication

This is the first required workflow change.

The current planning prompt both writes the proposal/specs and publishes them. Split the responsibilities:

1. Allocate the run-scoped planning work product before the first planning job.
2. Run a draft/repair job with no publication capability.
3. Run internal trace discovery and rechecks.
4. Publish through a trusted system action only after the internal review passes.

Planning identity should no longer be inferred from possession of `github.publish_planning_work_product`. The repository, OpenSpec change, remote planning branch, and eventual PR identity should be allocated once and materialized for all author and reviewer jobs.

The trusted publication action should publish the complete approved manifest from the durable candidate snapshot. Do not let the trace reviewer publish or edit the PR.

## Explicit model configuration

DEOS currently has no model or reasoning fields on `WorkflowJob`. The supervisor invokes `codex exec` without `--model` or `model_reasoning_effort`.

Add immutable job configuration similar to:

```yaml
model:
  name: gpt-5.6-sol
  reasoningEffort: high
```

For the first implementation:

- Pin the planning author to `gpt-5.6-sol` with `high` reasoning.
- Pin the internal self-check to the same model and effort.
- Pin the independent reviewer to an explicitly different supported model.
- Never rely on a personal or image-level default.

Include the selected model and effort in:

- the immutable workflow definition and digest;
- the durable job specification;
- the protected prompt evidence;
- the supervisor command;
- the result provenance;
- D1 review metadata; and
- the accepted sidecar reviewer provenance.

## Discovery and closed-set recheck contract

Each reviewer has exactly one discovery pass.

Discovery may inspect the entire proposal and every delta specification. It creates a baseline finding set and a complete v3 traceability sidecar.

Every later pass for that reviewer is a recheck. A recheck may only classify each baseline concern as:

- `fixed`
- `partially_fixed`
- `still_present`
- `cannot_verify`

The host must reject a recheck that:

- omits a baseline concern;
- adds a new concern;
- changes the baseline concern;
- reviews a different candidate digest from the one it declares; or
- lacks current evidence for its resolution judgment.

Finding IDs are stable handles, not the semantic comparison mechanism. Give the rechecker the full original concern, rationale, and evidence. Let the model judge whether the new text resolves the same meaning. The deterministic host verifies only the closed inventory, schemas, hashes, evidence references, and candidate identity.

The independent reviewer gets one new discovery pass after publication. It is allowed to disagree with the internal reviewer. Once its baseline is created, its own later passes are also closed-set rechecks.

## Traceability-specific schemas

Do not use the current free-form `review-result-v1.json` as the durable trace contract. Add separate schemas.

Suggested discovery result fields:

```text
outcome
summary
phase = internal | independent
mode = discovery
candidateDigest
reviewedHeadSha | null
traceabilitySidecarLogicalName
baselineFindings[]
providerReceipts[]
```

Suggested recheck result fields:

```text
outcome
summary
phase = internal | independent
mode = recheck
candidateDigest
baselineFindingSetDigest
resolutions[] {
  findingId
  status
  rationale
  currentEvidence[]
}
providerReceipts[]
```

Use host-derived overall outcomes. Do not trust the model to declare that all findings are fixed when its resolution records disagree.

## Durable storage

Store these as immutable R2 artifacts for every trace attempt:

- `bettaview-traceability.json`
- raw structured judge output
- normalized judgment
- materializer/validator output
- trace discovery or recheck result
- validation log
- transcript JSONL
- repository patch, normally empty for a reviewer
- candidate inventory and hashes, if not already fully represented in the sidecar

Continue using the standard DEOS manifest and create-only artifact policy.

Add D1 review metadata sufficient to find artifacts without scanning R2:

```text
review_id
run_id
attempt_id
phase
mode
round
author_model
reviewer_model
reasoning_effort
candidate_digest
reviewed_head_sha
baseline_finding_set_digest
sidecar_r2_key
overall_outcome
created_at
completed_at
```

The current job-input materializer loads prior `result.json` files and the latest cumulative patch. Add an explicit `traceability_feedback` input that loads only the selected accepted sidecar, baseline set, and latest resolution state. Do not require the author to infer the active review from twenty generic prior results.

## Cloudflare execution boundary

Run semantic trace computation in the existing DEOS Sandbox architecture.

The current DEOS image already pins matching `@cloudflare/sandbox@next` Worker and container versions and uses argv `exec` process handles. Keep that API line. Package the BettaView runner assets into the image or a versioned internal package. Avoid runtime cloning of the BettaView repository.

The trace reviewer should be logically read-only even though the controlled DEOS container currently runs Codex with broad authority inside its disposable Sandbox. It should receive no provider mutation capability, and its output policy should allow only the declared trace artifacts.

Provider credentials remain in the trusted Worker. A Sandbox may receive only its attempt-scoped capability token, and a trace-only job should normally receive no provider capability at all.

## Portal and visualization

Do not run the durable review portal as a Sandbox preview service.

Add BettaView as a review route in the existing Access-protected DEOS portal, for example:

```text
https://deos.voxdez.com/runs/<encoded-run-id>/review
```

The current BettaView Express server cannot be deployed unchanged to Workers because it uses Express, child processes, temporary directories, and process-local memory. Split it as follows:

- Move reusable frontend rendering and citation behavior into the DEOS portal bundle.
- Implement PR and trace APIs as Worker handlers.
- Use the existing GitHub App adapter to read PR metadata and exact-head Markdown.
- Load accepted sidecars from R2 through D1 review records.
- Launch new trace computation through the DEOS Workflow, not in the HTTP request.
- Keep generation progress in D1 so a portal request can poll without owning the process.

The review page should combine:

- the Linear issue and run identity;
- the planning PR and exact head SHA;
- author and reviewer model provenance;
- internal and independent review rounds;
- the accepted traceability sidecar for the selected round;
- rendered proposal/spec citations and findings;
- transcript/result/validation artifact links allowed by policy; and
- a visible stale state when the current PR head differs from the reviewed head.

Never silently show a sidecar against a newer PR head. Either select an older exact-head snapshot explicitly or enqueue the appropriate recheck.

The portal currently reads workflow links from `governed_work_links`, while planning PR identity is stored in `run_work_products`. Either record governed planning/review links when publication succeeds or join the planning record directly in the portal projection.

## GitHub integration

After independent review, have the trusted GitHub App create or update one Check Run on the exact reviewed head:

```text
name: DEOS OpenSpec traceability
external_id: <DEOS review id>
details_url: https://deos.voxdez.com/runs/<run-id>/review
status/conclusion: derived from the durable review outcome
```

Keep detailed findings in the sidecar and portal. The GitHub check summary should remain concise.

Automated review actions should use the existing GitHub App installation authentication. If the portal later allows a human to submit GitHub comments or approvals as themselves, add a separate GitHub user authorization flow. Do not attribute human actions to the installation token.

The author must continue updating the same planning PR during repair. Existing rules for replying to every affected human review thread and leaving resolution to the reviewer still apply.

## Linear integration

Linear remains the workflow and human-gate authority.

Add a durable portal link or attachment to the issue and expose a concise review state such as:

- internal check passed;
- independent review requested changes;
- independent findings fixed and verified; or
- review blocked.

Do not copy the full sidecar or repeat all findings into every Linear comment. The portal is the detailed evidence surface. Preserve the existing event-time authentication, Queue, selector, actor, and human-state rules.

## Recommended implementation slices

### Slice 1: trace job and durable artifacts

- Package the BettaView prompt, schema, runner, materializer, and validator into the DEOS image.
- Add explicit per-job model and reasoning configuration.
- Add a trace discovery job with no provider capabilities.
- Run it against an R2-restored planning patch.
- Persist and independently read back every expected artifact.
- Do not change the active selector or live planning workflow yet.

### Slice 2: internal author loop

- Separate draft generation from publication.
- Allocate planning identity before drafting.
- Add internal discovery, author repair, and closed-set recheck nodes.
- Bound the semantic repair loop.
- Publish only after the internal recheck passes.

### Slice 3: independent review and visualization

- Add a different-model discovery job after PR publication.
- Add author repair on the same PR and independent closed-set recheck.
- Add D1 review indexing and the R2 binding required by the portal.
- Add the portal review route and exact-head stale handling.
- Add one GitHub Check Run and one Linear portal link.

### Slice 4: controlled live proof

Use a dedicated test issue and repository. Prove:

1. provider-originated Linear event dispatch;
2. exact frozen workflow, prompt, repository, and model configuration;
3. author draft artifacts before publication;
4. internal sidecar and baseline findings in R2/D1;
5. author repair using the exact accepted feedback;
6. closed-set recheck with no new finding inventory;
7. one planning PR published at the recorded head;
8. independent review by the configured different model;
9. same-PR repair and exact-head recheck;
10. GitHub Check Run details link;
11. Linear link and human gate;
12. portal rendering from D1/R2/GitHub; and
13. Sandbox destruction followed by durable artifact read-back.

Tests and fixture outputs alone are not deployment evidence. Preserve provider receipts, D1 rows, R2 object hashes, exact GitHub head read-back, Linear state evidence, and portal HTTP/browser evidence separately.

## Important constraints

- Do not add BettaView IDs, citations, hashes, or markers to standard OpenSpec proposal, spec, design, or task files.
- Do not require the sidecar to be committed to the planning PR. Internal and independent sidecars may remain immutable R2 evidence.
- Do not let a reviewer mutate the repository or providers.
- Do not let a recheck expand its baseline finding inventory.
- Do not treat semantic findings as deterministic proof.
- Do not rely on model defaults; pin model and reasoning per job.
- Do not expose GitHub, Linear, or Codex provider credentials to untrusted repository code.
- Do not alter the active DEOS branch, selector, or deployed workflow until its current work has been refreshed and an OpenSpec change for this integration has been approved.

## Current platform references

- Cloudflare Workflows: <https://developers.cloudflare.com/workflows/>
- Cloudflare Sandbox 1.0 preview process model: <https://developers.cloudflare.com/sandbox/1-0-preview/processes/>
- Cloudflare Workers static assets and Worker-first routing: <https://developers.cloudflare.com/workers/static-assets/binding/>
- Cloudflare Access JWT validation: <https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/>
- GitHub Check Runs: <https://docs.github.com/en/rest/checks/runs?apiVersion=latest>
- GitHub App authentication: <https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/about-authentication-with-a-github-app>
- Linear webhooks: <https://linear.app/developers/webhooks>

## Expected next action for the DEOS agent

Before changing anything:

1. refresh the active DEOS worktrees and inspect all untracked files;
2. confirm the status of the live simplified planning proof and selector;
3. compare this handover with current `main` and the active implementation branch;
4. create a new, bounded OpenSpec change describing only the traceability integration delta;
5. stop after the proposal and delta specifications for human review unless separately authorized to continue.
