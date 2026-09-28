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

Use `deos-test` for the two lease actions. `deos-test marker`
accepts exactly `{"version":1,"action":"insert"|"find","expectationId":"..."}`.
It cannot write arbitrary Linear text or choose a different issue.
`deos-test browser` accepts `version:1`, a saved `service` (`portal` or
`bettaview`), and an `operation`. Start with `open`, then use `navigate`,
`state`, `click`, `fill`, `press`, `wait`, `viewport`, or `capture` with the relevant URL,
selector, text, key, or dimensions. The browser service chooses the fixed
lease origin and keeps the Access secret and app cookie. Do not request or
handle Cloudflare, Access, Linear, or GitHub account credentials.

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
