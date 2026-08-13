---
name: openspec-review-gated-flow
description: Run OpenSpec work through small, sequential, human-approved pull requests with one artifact layer per PR and no downstream generation before its inputs are approved. Use for non-trivial architecture, integration, or staged OpenSpec changes in this repository, and whenever the user asks for review gates, small PRs, easier judgment, or minimum downstream churn. Orchestrates proposal, delta specs, design, tasks, and implementation while stopping after every approval boundary.
---

# OpenSpec Review-Gated Flow

Optimize for reviewer attention and cheap rejection. Create only the currently
authorized artifact layer, publish it as a ready-for-review PR, and stop until the
user explicitly approves it and it is merged.

## Non-negotiable rules

- Use one PR per artifact layer. Do not combine proposal, specs, design, tasks,
  or implementation in one new PR.
- Do not generate a downstream artifact before every upstream artifact required
  by this workflow has been approved and merged.
- Treat independently ready artifacts as sequential human gates. For the default
  schema, use `proposal -> specs -> design -> tasks -> implementation`, even
  though OpenSpec technically allows specs and design after proposal.
- Never use `/opsx:propose`, `/opsx:ff`, or `openspec-propose` for a gated
  change; those fast-forward through multiple artifacts.
- Open completed stage PRs as ready for review, not draft, unless the user asks
  for a draft or the stage is knowingly incomplete.
- Do not infer approval from passing checks, review comments, elapsed time, or
  an approval of a different artifact. Wait for explicit user approval.
- Do not modify or split an existing PR retroactively unless the user asks.
- Never start implementation from a planning request. Implementation begins
  only after the tasks PR is approved and merged.

These rules override a broad request such as "plan and implement this change."
Complete the current gate and stop.

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

5. Select exactly one next artifact. Respect the schema's dependency edges,
   then serialize siblings according to the approved review order. For the
   default schema, select proposal, then specs, then design, then tasks.
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
| Tasks | `tasks.md` | Is the implementation decomposition right? |

Repository-wide policy or skill changes require their own PR; do not hide them
inside an artifact PR.

## Package the gate PR

Publish a small, ready-for-review PR containing only the current layer. Its body
must state:

- the artifact being approved;
- the single reviewer decision requested;
- the required reading order;
- the approved predecessor PR or artifact;
- which downstream artifacts are deliberately absent;
- validation performed;
- the linked Linear issue and OpenSpec change.

Stop after opening the PR. Report what was created, what was deliberately not
created, and what approval would unlock next.

## Continue after approval

Proceed only after explicit user approval and after confirming the predecessor
PR is merged. Refresh the default branch, query `openspec status` again, and
start a new branch from that refreshed default branch for the next artifact.

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

## Implement in reviewable slices

After the tasks gate merges, implement one coherent task or small task group per
PR. Each implementation PR must:

- cite the approved task identifiers and relevant requirements;
- include only the code, tests, evidence, and task-checkbox updates for that
  slice;
- satisfy provider-contract and real E2E requirements from repository guidance;
- stop for explicit approval before beginning another slice.

Do not let an apply workflow consume the entire checklist when that would create
a large PR. Resume from the first approved, unchecked task after each merge.

## Fast-path exception

Use the all-artifacts fast path only when the user explicitly opts out of staged
review for a specific change. Do not infer an exception because the change seems
small or urgent.
