---
name: openspec-review-gated-flow
description: Run OpenSpec work through small, sequential, human-approved proposal, specification, and design pull requests, then generate tasks internally and implement autonomously to one final PR. Use for non-trivial architecture, integration, or staged OpenSpec changes in this repository, and whenever the user asks for review gates, small planning PRs, easier judgment, or minimum downstream churn.
---

# OpenSpec Review-Gated Flow

Optimize for reviewer attention and cheap rejection while choices are still
upstream. Publish proposal, delta specifications, and design as separate
ready-for-review PRs. After design approval, generate the task breakdown
internally and implement it autonomously; publish tasks, code, tests, and evidence
together in one final ready-for-review PR.

## Non-negotiable rules

- Use one PR for each human-reviewed planning layer: proposal, specs, and design.
  Do not combine those layers in one new PR.
- Do not generate a downstream artifact before every upstream artifact required
  by this workflow has been approved and merged.
- Treat the reviewer-facing artifacts as sequential human gates. For the default
  schema, use `proposal -> specs -> design`, even though OpenSpec technically
  allows specs and design after proposal.
- Never use `/opsx:propose`, `/opsx:ff`, or `openspec-propose` for a gated
  change; those fast-forward through multiple artifacts.
- Open completed stage PRs as ready for review, not draft, unless the user asks
  for a draft or the stage is knowingly incomplete.
- Do not infer approval from passing checks, review comments, elapsed time, or
  an approval of a different artifact. Wait for explicit user approval.
- Do not modify or split an existing PR retroactively unless the user asks.
- Never start implementation before the design PR is explicitly approved and
  merged. After that approval, tasks are an internal execution artifact and do
  not require a separate PR or approval by default.
- After design approval, continue through task generation and implementation to
  one final PR without asking for intermediate task or code review. Stop earlier
  only if the user explicitly requests task/code gates or a genuine blocker
  requires a material product or design decision.

These rules override a broad request such as "plan and implement this change"
until design is approved. Complete the current planning gate and stop; after the
approved design gate, continue autonomously to the final implementation PR.

## Establish the graph and current gate

1. Inspect repository instructions, worktree state, current branch, open PRs,
   and the target branch. Preserve unrelated work and existing PRs.
2. Identify or create the corresponding Linear issue when project guidance
   requires one. Record the goal, scope, acceptance criteria, and OpenSpec
   change name.
3. If the change does not exist, scaffold it without generating artifacts:

   ```bash
   openspec new change "<change-name>"
   ```

4. Query the authoritative graph:

   ```bash
   openspec status --change "<change-name>" --json
   ```

5. Select exactly one next reviewer-facing artifact. Respect the schema's
   dependency edges, then serialize siblings according to the approved review
   order. For the default schema, select proposal, then specs, then design.
6. If the selected artifact's predecessor PR is not merged, stop. Do not use a
   stacked branch to begin downstream work.

Use the planning root and artifact paths returned by the CLI. Preserve a
selected OpenSpec store for all commands when the change belongs to one.

## Produce one artifact layer

Start the stage branch from the latest remote default branch after all prior
gates have merged. Never base it on an unapproved artifact branch.

Get the selected artifact's instructions:

```bash
openspec instructions "<artifact-id>" --change "<change-name>" --json
```

Then:

1. Re-read every declared dependency from disk.
2. Follow the returned template, instructions, context, and rules.
3. Write only the selected artifact's resolved output files. The proposal stage
   may also contain the new change's `.openspec.yaml` scaffold.
4. Do not create any artifact merely because the status reports it as ready.
5. Run applicable validation and inspect the complete diff against the PR base.
   Missing downstream artifacts are expected and must not be "fixed."

For the default schema, enforce these scopes:

| Gate | Allowed OpenSpec change files | Reviewer decision |
| --- | --- | --- |
| Proposal | `.openspec.yaml`, `proposal.md` | Is the intent, scope, and high-level approach right? |
| Specs | `specs/**/*.md` | Is the required observable behavior right? |
| Design | `design.md` | Is the technical approach right? |
| Tasks | `tasks.md` | Internal checklist generated only after design approval; included in the final implementation PR |

Repository-wide policy or skill changes normally require their own PR; include
them in a final implementation PR only when the user explicitly authorizes that
scope.

## Package the gate PR

For proposal, specs, and design, publish a small, ready-for-review PR containing
only the current layer. Its body
must state:

- the artifact being approved;
- the single reviewer decision requested;
- the required reading order;
- the approved predecessor PR or artifact;
- which downstream artifacts are deliberately absent;
- validation performed;
- the linked Linear issue and OpenSpec change.

Stop after opening each planning PR. Report what was created, what was
deliberately not created, and what approval would unlock next. Do not open a
tasks-only PR under the default policy.

## Continue after approval

For proposal, specs, and design, proceed only after explicit user approval and
after confirming the predecessor PR is merged. Refresh the default branch,
query `openspec status` again, and start a new branch from that refreshed default
branch for the next artifact. Once the design PR is approved and merged, create
a dedicated implementation worktree from the refreshed default branch, generate
`tasks.md`, and apply the complete checklist without another approval pause.

If approval includes requested edits, revise only the current artifact in its
existing PR. Re-present it for approval; do not advance.

## Handle upstream rejection or revision

Before downstream artifacts exist, revise only the rejected upstream artifact.

If downstream artifacts already exist:

1. Create an upstream-only amendment PR.
2. Identify downstream artifacts as potentially stale, but do not modify them
   in the same PR.
3. After the amendment is approved and merged, reconcile each affected layer in
   dependency order using a separate PR and approval gate.
4. Do not use a whole-change update workflow that silently rewrites every
   dependent artifact at once.

If the intent changes fundamentally, propose a new OpenSpec change instead of
rewriting the old chain beyond recognition.

## Implement to one final review PR

After the design gate merges, generate tasks from the approved specs and design,
then implement the checklist autonomously. The final implementation PR must:

- cite the approved planning PRs, task identifiers, and relevant requirements;
- include `tasks.md`, the coherent implementation, tests, evidence, and completed
  task-checkbox updates;
- satisfy provider-contract and real E2E requirements from repository guidance;
- be ready for review rather than draft when all completion evidence exists.

Do not pause merely to expose the task breakdown or individual code slices. If a
task uncovers a material contradiction in the approved design, stop and request
that decision rather than silently changing the design.

## Fast-path exception

Use the all-planning-artifacts fast path only when the user explicitly opts out
of proposal/spec/design review for a specific change. Do not infer an exception
because the change seems small or urgent. A user may also explicitly request
task or code-slice gates; that request overrides the post-design default for the
named change.
