---
name: deos-implementation
description: Build, demonstrate, and resume an implementation inside the DEOS Cloudflare runtime using its assigned preview, browser, and trusted tools.
---

# Work from the saved implementation

Read `/deos/run/implementation-input.json`, its issue context, and saved work.
Accepted clarification history is ordered by gate visit. Apply a later relevant
human answer over an earlier assumption or demo instruction. Explain the effect
in your result so the next agent has the same decision. Replies do not grant
credentials or production access. Keep unrelated answers out of other decisions.

Claude chooses the useful demo scenarios for the approved implementation. There
is no fixed screenshot quota. Implement, run useful checks, and demonstrate those
scenarios. Address Claude's findings once; human review follows your response.
A human-requested revision updates the same PR without another automatic review.

# Use the supported runtime

- Edit repository and request files through the shell with Python, Node, `cat`
  or `tee`. Native patch tools are unavailable, and `apply_patch` is not a shell
  executable in this runtime.
- Save request JSON and scratch scripts under `/deos/output/requests/`, outside
  the repository. Write each complete request before calling
  `deos-implementation REQUEST_FILE`. Read `deos-implementation --help`.
- Search current official documentation with native web search and open sources
  with `action: document`. Restricted shell networking does not prevent research.
  `action: search` only searches a site's optional `/llms.txt` index; it is not a
  general search engine. If that index returns 404, use native web search and
  open the relevant official page instead of retrying the missing index.
  Optional repository-guide searches may return no matches. Handle that outcome
  separately from permission or IO errors, and do not chain unrelated inventory
  behind a search that may return exit 1. Use the supplied OpenSpec instructions;
  a slash-command name is not evidence of an installed `opsx` executable.
- Shell and checked Node commands receive the Cloudflare CA through
  `NODE_EXTRA_CA_CERTS`. Do not disable TLS verification. A nested clean environment
  must preserve `/etc/cloudflare/certs/cloudflare-containers-ca.crt`.
- Install dependencies only when missing or changed. A resumed job restores code,
  tasks, checks and proof, but fresh compute may need dependencies installed.
  Check that tools exist and install dependencies before invoking tests or builds.
  Do not redo proposal, design, completed implementation, or unchanged demos.
  Before installing, add generated dependency and build directories to the
  repository's `.gitignore` (for example `node_modules/`, `dist/`, `coverage/`,
  `.wrangler/`).
  Checks snapshot changed source files; dependencies and their executable
  symlinks are not implementation files to publish.
- Keep one build or test suite active at a time. If a checked command is slow,
  inspect its activity or stop that command before trying another route. Starting
  the same suite directly while its checked copy is still running adds contention
  and does not diagnose the wait. Use the test runner's concurrency controls when
  the assigned sandbox needs them.
- Run installs, builds and tests through `action: check`, with a stable `requestId`
  such as `install-1` or `test-1`. Submit returns a receipt with `queued`, `running`,
  `completed`, `failed`, `canceled` or `interrupted`. Exit75 means still active;
  it is not success or a reason to resubmit. Use `deos-implementation --wait
  REQUEST_FILE` for a dependent shell sequence: it exits with the command's
  failure code and returns the saved result in `result`. Never infer completion
  from a shell yield or missing stdout. Poll `{"action":"operation",
  "requestId":"install-1"}` to retrieve the same work, including exit status,
  stdout/stderr, timestamps and last output activity. Set `dependsOn:["install-1"]`
  on tests/builds to prevent execution unless installation completed successfully.
  Reuse an ID only to retrieve identical work. After an edit or intentional rerun,
  use a new ID. Failed results are retained; they are not silently retried.
  Await the submission acknowledgement before polling it. If acknowledgement is
  missing, resubmit the exact saved request with the same ID; an unknown ID is
  not a reason to create another operation.
  Direct bash/sh checks stop at unhandled errors (bash pipelines too). In native
  shell sequences use `set -e` and, for bash, `set -o pipefail`, or explicitly
  save and return the primary command's status after diagnostic commands. A
  successful echo or curl must not replace a failed tool's exit status.
- `action: status` never waits for a demo or check. It includes operation
  summaries, last activity, deadlines and saved proof image paths. `running`
  without recent output means no progress was observed; it does not establish a
  dead process. Inspect the recorded phase and deadline. Do not launch a second
  copy to diagnose silence. Use `action: cancel` with the requestId for a queued
  operation or running check. A running demo cannot be canceled mid-action;
  a client disconnect leaves the existing operation available for retrieval.
- Use `action: diagnostics` for recent tool errors, operation receipts and
  progress-delivery timing. `status` includes these errors even if a surrounding
  shell command returned zero. Do not read protected diagnostics or heartbeat files.
- Build into a dedicated directory such as `dist`. `action: preview` with only
  `assets: "dist"` uses the hosted static publisher when available. A Worker
  entrypoint, D1/R2 bindings, or explicit `target: "local"` uses the local runtime.
  The returned `status.preview.target` distinguishes these paths. Do not serve the whole repository:
  unnecessary file watchers previously exhausted the runtime.
- Check the app from the shell or assigned browser at `http://127.0.0.1:8787`.
  Chromium runs inside this sandbox. Local preview needs no public URL or tunnel.
  For real D1/R2 proof, publish the temporary environment and use `target: remote`;
  Chromium opens the deployed app through its owned Worker URL. `target: hosted`
  opens a checked static deployment. Other outbound destinations retain the saved
  policy. Use browser results and publisher read-back for hosted reachability.
  Bound network probes explicitly, such as `curl --connect-timeout 5 --max-time 20`,
  so an unresponsive development server does not consume the build deadline.
- Repeat the same preview settings to reuse the running local app. Do not
  allocate competing processes or erase local test data to reconnect a browser.

# Collect demonstrations

The browser is headless Chromium inside this sandbox, controlled over a local pipe.
No Cloudflare Browser Rendering session or preview tunnel is allocated. Browser
screenshots still pass through trusted capture and durable evidence publication.
Save one scenario list and execute it with `action: demo` and a stable `requestId`.
Use `--wait` or retrieve its operation receipt. Repeating the same request returns
that operation, never another collection. Use a new ID only for an intentional
new collection after a failure or relevant change. Each scenario gets a
fresh browser context. Prepare independent server-side fixtures as needed;
resetting browser state does not reset databases or provider resources.
If a browser operation loses its response, its action may already have run.
Do not retry that click or submit on its own. Reset server fixtures when needed
and rerun the saved scenario list from zero. If the local browser process has
ended, report the original error and preserve the work for a fresh attempt.
Reset replaces a live browser context; it does not silently replay work after
a process crash. Diagnostics identify the local transport and browser version.
Await the entire collection before editing code, harness, preview, or steps.
After an action fails, correct the cause and rerun from the starting state.
Use screenshots of meaningful outcomes, inspect them, and describe what they show.
Open the original `imagePath` returned by the browser with native `view_image`.
Completed operation results retain `result.captures[].imagePath`; status also
lists the selected collection's image paths. Retrieve these instead of repeating
successful scenarios when stdout is lost. Do not search protected runtime folders.
ImageMagick tools such as `montage` are not installed. Inspection does not need
composite images; keep the original browser captures for the PR.

When `temporary-environment-v1` is listed, use `publish_environment` for real
remote Worker/D1/R2 tests. Give it a stable `requestId`, a repository-relative
`main` path to a bundled JavaScript ES module, optional built `assets` directory,
and optional `d1:["DB"]` / `r2:["BUCKET"]` names (at most one each). Bundle your
own dependencies first; the trusted service never runs build scripts with provider
credentials. The module exports `default.fetch(request,env,ctx)`. It receives its
assigned bindings and `env.ASSETS.fetch(request)` for uploaded assets. It cannot
choose resource IDs, account, Worker name, credentials or production routes.

Use `storage` with a stable request ID for `migrate` (an `id` plus a `statements`
array; identical retries are safe), `query` (one SELECT with optional `params`),
`objects` (optional cursor), `object` (key), or `request` (method, relative path,
optional JSON body). Inspect both D1 rows and R2 objects to demonstrate real
storage. HTTP requests return status and body; assert the expected status yourself.
Use app endpoints for fixture resets. Do not modify the reserved migration table.
Call with `--wait` before dependent work. If publication fails, inspect the saved
error then explicitly retry the same bundle using a new local operation ID;
the service reconciles the same provider resources. Do not repeat a migration
with changed SQL under the same migration ID. No account token is available.

Publish before opening the browser and use `target:"remote"` in demos. Keep the
app fixed during a demo collection. Each new author attempt gets fresh resources;
restore schema/fixtures as needed. Cloud review and response finish before DEOS
deletes the temporary environment after publishing the PR and durable GitHub
screenshots. State in the PR that the live environment is retired. The screenshots
and logs remain. This is test deployment, not a production release.

When `static-preview-v1` is listed in the input capabilities, a finished static
build can use `{"action":"publish_preview","assets":"dist"}`. The service
publishes only static assets to an isolated nonproduction Pages project and
returns its immutable review URL. It does not run repository code with tokens.
For a static-only app, publish the build and open it directly with `target:
"hosted"`; a local preview process or Quick Tunnel is not required. Use a local
preview when useful during development or when the app needs a local backend.
For hosted browser navigation, use `url: "/"` so the service selects its assigned
review origin. The immutable deployment URL is for the human review link; it is
not necessarily an allowed origin in the current browser session. Await a
successful navigation before issuing exploratory viewport or state commands.
Use `target: "hosted"` in demo scenarios to capture that deployment. Publish
before the first browser command, and republish after changing the build. Keep
the build fixed while collecting. A pending response means retry the same request
to read back the deployment; do not invent CI or request provider credentials.
Backend code still runs in the assigned local Worker environment; this static
adapter does not deploy backend services or replace real integration proof.

For nonvisual behavior, `action: check` with `behavior: true` captures executable
Showboat output. Add `audience: "review"` only for a concise behavior demonstration
intended for the PR. Ordinary checks, unit tests, and exploratory commands stay
in diagnostics. Browser measurement output stays there too.
Checked shell commands may call the browser tool: the command waits separately
from the browser queue. Browser calls still wait for any running demo collection.
Keep multi-step browser demonstrations in one `action: demo` request so unrelated
browser requests cannot interleave their steps. Do not wrap one checked command
inside another; invoke the inner executable directly.

# Resume and report

Use `{"action":"task","taskId":"1.2","state":"active"}` before working on
an existing task, then send `state: "completed"` immediately when its work finishes.
Save each request in a file. This updates one checkbox atomically, records a
timestamped task event, and wakes the existing file watcher. `state: "pending"`
reopens a task; repeated completion is idempotent. Report tasks as they finish,
not in a batch after the whole build. If one edit finishes several tasks, report
that honestly; do not invent elapsed time or animate fake progress. Keep demo
and handoff tasks open until those actions finish. Status includes the latest
task and notification timing; notification acknowledgement is not proof that
the portal has displayed it. Task completion remains your judgment.

Resume the failed operation using saved work. Rerun only checks or demos affected
by an actual edit or relevant environment change. Removing generated scratch
files or updating ignore rules does not invalidate demonstrations of unchanged
served assets. Keep the original evidence and explain the cleanup; do not repeat
a collection merely to make its recorded tree hash match that metadata edit.
Use the same provider operation
ID only to recover the exact same request; changed data needs a new operation ID.
Report the current action, outcome, and any blocking choice in plain language.
If a required capability or human decision is missing, return one actionable
`needs_human` question with a stable block key. The service posts it on Linear.

The PR presents the issue, approved planning/design links, behavior images and
explanations, current preview when available, and one Showboat link. Keep internal
test results and agent discussion in transcripts. The workflow does not judge
your checks, Claude's findings, or image quality. Final approval stays human.

After the final collection, use `action: status` to list saved proof IDs and
captions, then submit `{"action":"select_proof","ids":["..."]}` with the images
and Showboat records to add in presentation order. Earlier selected evidence is
carried forward. Completed demo collections add images; failed collections never
erase earlier ones. Use `omit: [{"id":"...","reason":"..."}]` to remove an obsolete
item from presentation explicitly. Its original record remains saved, and the
omission reason is retained for review.
`proofScenarios` in status groups captures by scenario and shows their selection.
Review this map before handoff: keep the before/after states needed to show each
claimed transition and recovery. The map is descriptive, not a coverage gate.
Omit obsolete or failed exploratory records from that selection; their original
bytes and errors remain in diagnostics. Repeat selection if you collect new
proof. Selecting evidence is your editorial decision, not a workflow quality test.

Status includes `evidenceChecklist`, with one stable item for each saved demo
scenario. It survives author responses and retries. Update items using a saved
request file, for example:

```json
{"action":"evidence_checklist","items":[{"id":"SCENARIO_ID_FROM_STATUS","state":"complete","evidenceIds":["PROOF_ID_FROM_STATUS"],"reason":"The saved item remains readable after refresh."}]}
```

Use `pending` while unfinished, `complete` with evidence links and an explanation,
or `not_applicable` with the explicit scope reason for the reviewer to assess.
Update an existing item rather than removing it. All changes retain history.
After selecting the final proof, read status and fix each `evidenceProblems`
entry before handoff. Publication checks that every saved scenario is accounted
for and all referenced images or review Showboat records will be published.
It does not judge image quality, set a screenshot count, or certify that an
author's completion or not-applicable claim is correct. Claude and the human
reviewer make those judgments. Use needs_human for a genuine unresolved blocker.
