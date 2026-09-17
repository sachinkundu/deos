# Proposed next canary: a small text snippet shelf

Status: prepared brief only. No Linear issue, run, provider resource or sample-app
implementation has been created for this canary.

## User outcome

People can keep a few named text snippets on one desktop screen. They enter a
title and text, save it, select a saved title to read its text, and delete it.
The saved snippets remain available after a refresh and in a fresh browser
session. A clear message handles invalid input or a failed save/read/delete.

Keep the scope small: no login, sharing, search, tags, rich text, editing existing
snippets, file uploads, mobile layout or external integration. Use only synthetic
canary text. Suggested app limits are an 80-character title and a 4 KiB UTF-8
body; these are product constraints, not claims about provider limits.

## Storage responsibilities

- **D1:** a single table with snippet ID, title, R2 object key and creation time.
  Listing snippets reads this table.
- **R2:** one plain-text object per snippet. Opening a snippet reads its body
  from this object, rather than storing the body in D1 or browser storage.
- **Worker:** serves the small API and frontend using assigned bindings. Save
  and delete must handle partial failure across the two stores; an operation
  must not report success while leaving a visible broken record. The cloud
  design agent chooses the bounded consistency/recovery approach.

This exercises database insert/list/delete, object put/get/delete and a small
cross-store consistency case without adding authentication or upload tooling.
The interface can use a title input, textarea, Save button, list, read panel and
Delete button. The cloud agents choose the design and demonstration count.

## Evidence for completion

The cloud agents should show saving two snippets, reading the right text for
each, refreshing and reopening from a fresh browser context, and deleting one
while the other remains. Show invalid input leaving both stores unchanged.
Use synthetic fixtures scoped to the run and reset server data explicitly
between independent scenarios; a browser reset alone does not clear D1/R2.

Provider evidence must independently confirm matching D1 rows and R2 keys,
object bytes/hash after save, and absence from both stores after delete.
The review preview must reach the deployed Worker and its isolated remote D1/R2,
with original provider errors retained. Local workerd/emulator checks may support
development but must be labeled as such. Reading DEOS's own orchestration D1 or
artifact bucket does not count as the application's storage proof.

Stop at a review-ready implementation PR, with a working backend preview and
useful real screenshots. Keep implementation unmerged and unreleased. Preserve
preview/data for human review under an explicit cleanup policy; retiring the
canary must remove only its own resources.

## Capability prerequisite before launch

The existing `preview` tool creates local D1/R2 bindings in the isolated sandbox.
The existing persistent publisher deploys static assets to Pages. Neither is a
general backend publisher with remote D1/R2. Do not assume this capability exists.

Prepare a narrow trusted backend-preview adapter with one Worker, one D1 database
and one R2 bucket per canary run, or equivalently isolated pre-provisioned test
resources. Provider credentials stay in the trusted service. The author receives
only the assigned bindings and scoped operations, not a general deployment token.
Use stable resource identities, repeatable deployment readback, exact schema
migration scope, provider receipts and idempotent cleanup. Deny production and
other-run targets. Verify the intended deployed Worker and remote storage before
starting the full canary. No access to production DEOS DB/ARTIFACTS may be reused
as application storage.

This capability work is a prerequisite, not part of the small application's
feature scope and not implemented by the reading-canary repair patch. Once it is
ready, use the normal Linear/OpenSpec flow and let Cloudflare agents write all
app code, tests and proof.

## What the next run should measure

Record task completion time, watcher delivery time, durable progress observation
and visible portal refresh separately. Count actual progress events rather than
animating increments. Track dependency ordering, responsive demo status,
same-ID result retrieval, errors hidden by compound commands, proof selection
corrections, and convergence of sandbox/browser/storage cleanup. Keep provider
faults, app bugs, agent recoveries and supervisor interventions separate in the
prospective failure log.
