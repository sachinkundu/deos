# Shared test demo

Read the saved job context in `/deos/run/job.json`. It names one task, one
lease, one candidate commit, and the permitted test app origins. Verify the
checkout is that commit before using it. Do not change repository files.
If the context contains `inheritedDemo`, use its approved scenario plan and
review feedback as the work list. Run every scenario against the actual lease
app and stores. The old captures, fixture pages, mocked Showboat, and checked
items are historical records, not proof for this commit. Report each scenario
as demonstrated or blocked with its real receipt; do not mark an item complete
from an old image or unit test.

Start `/deos/output/showboat.md` with `showboat init`. From the repository root,
run `showboat exec /deos/output/showboat.md bash 'git rev-parse HEAD'` first,
then each real `deos-test` action with its
output. This document is private raw evidence. Do not copy credentials into
its commands or publish it yourself. Keep JSON requests under
`/deos/output/requests/` and pass only their paths to `deos-test`.

Use `deos-test` for the lease actions. `deos-test marker`
accepts exactly `{"version":1,"action":"insert"|"find","expectationId":"..."}`.
It cannot write arbitrary Linear text or choose a different issue.
`deos-test browser` accepts `version:1`, a saved `service` (`portal` or
`bettaview`), and an `operation`. Start with `open`, then use `navigate`,
`state`, `click`, `fill`, `press`, `wait`, `viewport`, or `capture` with the relevant URL,
selector, text, key, or dimensions. `reset` starts a fresh browser context;
then navigate and sign in again. The browser service chooses the fixed
lease origin and keeps the Access secret and app cookie. Do not request or
handle Cloudflare, Access, Linear, or GitHub account credentials.
Use `select` with the rendered paragraph's CSS `selector` to select its actual
text and open the app's inline-comment composer, then fill and click as usual.

For authenticated API replay and negative cases, browser operation `api` takes
`url` (an app `/api/pr`, `/api/review-continuations`, `/api/review-continuations/publish`,
`/api/review-continuations/action`, or `/api/settings/bettaview-account` URL),
`method` (`GET` or `POST`), and a JSON-encoded `body` for POST. It uses the current
browser session and returns the actual HTTP response. All inputs still go in
a request file. Do not use this in place of the required visible UI steps.

When the context includes `reviewFixture`, use `deos-test review` for its
bounded scenario setup and readback. If the installed helper predates this
action, copy that helper to `/deos/output/deos-test.mjs`, add `review` to its
existing kind allowlist, and run that file with Node. Keep its existing
authentication and request-file behavior; never print its environment.
Requests use `version:1` and `operation`. `bootstrap` returns the checked
project and user inputs for Settings. `prepare` takes a `scenario` such as
`s02` or `s08-retry`: it resets the disposable issue to Human Review, retains
the prior scenario facts, and uses the candidate's real run allocator and
Workflow. Call it before opening that scenario's fresh browser context.
`evidence` takes the same scenario and returns actual lease D1 facts, verified
provider events, and the separately labeled fault injections. `github.read`
accepts the fixed fixture PR path suffix (`/reviews`, `/comments`, `/files`,
or empty); `linear.read` reads the one disposable issue.
`seed_thread` adds one labeled starting thread for reply tests. `advance_head`
adds a fixed edit to the disposable branch. `move_without_review` makes the
unauthorized app-originated transition for s12; `step:2` repeats it once.
These three operations take the current `scenario` and keep their real
provider receipts separate from actions being demonstrated in the app.

For approved negative cases, `inject` takes the current scenario and one
`kind`: `github_reject_review`, `github_drop_reply_response`, `github_advance_after_reply`,
`linear_reject_move`, `account_identity_mismatch`, or `hold_linear_delivery`.
These affect outbound transport only and must be labeled synthetic in the
evidence. `clear_injections` ends an armed fault. For the missed-delivery
case, hold delivery, wait for the actual Linear mutation, then call
`shorten_delivery_deadline` and read the real app status. The helper changes
only that test input; the candidate decides the result. No fixture helper
creates a review receipt, gate choice, successful result, or traversal.
`github_advance_after_reply` advances the real disposable GitHub branch after
its real reply receipt and before the next app permit. Label this deterministic
test scheduling; record the provider's before/after heads. The candidate must
make the abandonment decision. The fixture review file is `canary-review.md`.

After the real app state is visible, call `capture`. This saves a private raw
image and returns its proof ID. Include that ID in the report. The capture is
not safe to publish until the trusted sanitizer approves a separate copy.

Show real app use and one provider-made Linear event, then save the observed
receipts to the requested output files. Public screenshot publication is not
available until the trusted sanitizer has passed; report that proof as blocked
instead of fabricating it. If the browser service, an app origin, or a
required action is unavailable, report `blocked` with the exact failed
operation. Do not invent a screenshot, provider event, deployment, or D1
readback. Do not call a staging or live release path.
