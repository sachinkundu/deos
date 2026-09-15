# Keep repeated captures verifiable

SAC-225 attempt `01a0a71b-189a-7e4a-8191-2939b1af2e97` stopped on
2026-09-15 at 22:39 UTC before Demo Gate. The final candidate retained the
25/25 checklist, 24 passing unit cases, 16 passing browser cases, two passing
evidence cases, a production build, and the local workerd 404-to-200 recovery.
The saved patch remains
`4186436ba4ee6d86b2e2d2d6c1a2e8c5cd52325344881868943a45c32c37ccec`.

The first rejected screenshot had hash
`88f1def22c061df0daae098fa681ce5e8d38710c231644ed230d907c88514f7b`.
The broker captured it again for the final tree, but its content-addressed R2
key already belonged to a screenshot from an earlier attempt and tree.
`implementation_proof.r2_key` is unique. `INSERT OR IGNORE` skipped the new
receipt, while the broker returned the new receipt ID as if it had saved it.
Completion verification then correctly rejected the missing receipt with
`untrusted_proof`.

Proof object keys now include the attempt and tree. Only a conflict on the
same proof ID is idempotent; other database failures propagate. The broker
reads back the receipt before returning its saved path. A regression using
the actual broker and SQLite schema failed with HTTP 400 before this repair.
It now verifies identical bytes captured for a new tree or attempt, while
keeping repeat capture within one identity idempotent and preserving the
existing identity and integrity rejections.

The author's intended result was `needs_human`: the assigned browser lacked
real key dispatch and viewport resizing. Those commands are now supported as
`press` with `key` and `viewport` with integer `width` and `height` in CSS pixels.
They operate on the assigned browser and retain navigation-status and origin
checks. The runtime instructions describe them and retain one browser per
try. A viewport-triggered failed navigation still cannot become visual proof.

This does not waive the approved Pages preview or silently amend saved demo
scenario 14. The latter asks for browser replacement within a try, which the
runtime does not permit. These requirements still need reconciliation through
the durable workflow before acceptance. The Pages project was provisioned at
22:38:46 UTC, but no assets were deployed. Repository-level GitHub secrets were
empty when checked at 22:42 UTC; protected deployment credentials have not been
configured.

All 555 backend tests pass. TypeScript checks, generated Worker binding checks,
OpenSpec strict validation for SAC-172, and `git diff --check` pass.

At this checkpoint the repair is local. No retry, production portal change,
implementation PR, or final review approval has occurred.
