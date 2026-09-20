# Keep evidence through author corrections

In the SAC-246 internal-browser repeat, the first author captured eleven useful
images. The reviewer asked for missing failed-read and failed-delete proof. The
response added three images, but starting a new demo removed the earlier images
from the active evidence list. The publisher then showed only the response's
three images. The originals survived in R2; the workflow lost their PR selection.

This change keeps semantic judgments with the agents and human reviewer. There
is no screenshot quota and no new independent review round.

## Agent checklist

The trusted runtime creates one checklist item per scenario in the saved demo
plan. The plan's steps remain the instructions for individual captures. The
author sees the checklist in `status` and updates it through `evidence_checklist`:

```json
{
  "action": "evidence_checklist",
  "items": [{
    "id": "saved-plan-scenario-id",
    "state": "complete",
    "evidenceIds": ["saved-proof-id"],
    "reason": "The saved item is still readable after refresh."
  }]
}
```

Items start pending. Complete items need evidence links and a reason. An author
may mark an item not applicable with an explicit scope explanation. The reviewer
judges that claim; the program does not approve it. One image may support more
than one item, and an item may need several images or a Showboat record.

Updates preserve the full history, including the attempt, tree and plan identity.
An unchanged plan resumes the checklist. A revised plan starts its items pending
while retaining prior history. The reviewer receives the checklist and omission
reasons alongside the images and saved source.

## Preserve work

- A successful demo adds its captures. Starting or failing another demo cannot
  erase previous completed evidence. Partial failed captures remain diagnostic.
- `select_proof` adds to the saved selection. Its `omit` field requires an image
  or record ID and a reason to exclude it explicitly. Excluded records remain in
  the evidence archive and can be selected again.
- The candidate saves the full archive separately from the PR selection.
- An atomic runtime checkpoint and failure capture preserve the checklist,
  archive and selection through a stopped supervisor. Older recovery snapshots
  without evidence fall back to the last saved candidate's evidence.
- Historical screenshots retain their original source identity. Keeping an image
  does not declare it current after an implementation change; agents judge that.

## Before PR publication

Status lists actionable bookkeeping problems. Before writing proof assets or
creating/updating the PR, the publisher checks that the checklist matches the
saved plan, contains every scenario exactly once, has no pending items, and links
only to selected images or review Showboat records that it will publish. It does
not decide whether the images satisfy the requirement. Incomplete work and its
diagnostics remain saved if publication is blocked.

The PR links a rendered checkbox list and its immutable JSON record. Each evidence
link points to an image or a specific Showboat section. The evidence manifest
also records exclusions and source identities. No database migration is needed.
Legacy candidates without this new checklist remain publishable under their
existing contract; new runtime candidates with a demo plan carry the checklist.
Workflow version 42 supplies the updated author and reviewer instructions. Existing
frozen runs need an explicit supported upgrade before using those new prompts.

## Validation and rollout

Regression tests cover eleven retained images plus three corrective images,
failed collection preservation, explicit omissions, a killed supervisor,
checklist resumption, changed plans, missing links and publication before any
external write. These are local regression checks, not a new cloud canary.

Before activation, complete CI and the implementation-only cloud canary. Verify
that the Cloudflare author fills the checklist, the reviewer reads it, a response
retains the earlier evidence, and the final PR publishes both sets without a
supervisor adding a comment. Preserve the existing proposal and design.
