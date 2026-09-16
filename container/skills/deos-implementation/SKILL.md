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
- Shell and checked Node commands receive the Cloudflare CA through
  `NODE_EXTRA_CA_CERTS`. Do not disable TLS verification. A nested clean environment
  must preserve `/etc/cloudflare/certs/cloudflare-containers-ca.crt`.
- Install dependencies only when missing or changed. A resumed job restores code,
  tasks, checks and proof, but fresh compute may need dependencies installed.
  Do not redo proposal, design, completed implementation, or unchanged demos.
  Before installing, add generated dependency and build directories to the
  repository's `.gitignore` (for example `node_modules/`, `dist/`, `coverage/`).
  Checks snapshot changed source files; dependencies and their executable
  symlinks are not implementation files to publish.
- Build into a dedicated directory such as `dist`. Start `action: preview` with
  `assets: "dist"` and/or a Worker entry file. Do not serve the whole repository:
  unnecessary file watchers previously exhausted the runtime.
- Check the app from the shell at `http://127.0.0.1:8787`. Use the assigned browser
  to inspect the public preview URL. Shell fetch to a Quick Tunnel URL may be
  blocked by egress even when browser access works. This is not an app failure.
- A tunnel may need time to become ready. Retry the same preview operation so
  the service can reconcile it. Do not allocate competing preview processes.

# Collect demonstrations

The browser runs in Cloudflare's browser service, separately from this sandbox.
Save one scenario list and execute it with `action: demo`. Each scenario gets a
fresh browser context. Prepare independent server-side fixtures as needed;
resetting browser state does not reset databases or provider resources.
Await the entire collection before editing code, harness, preview, or steps.
After an action fails, correct the cause and rerun from the starting state.
Use screenshots of meaningful outcomes, inspect them, and describe what they show.

When `static-preview-v1` is listed in the input capabilities, a finished static
build can use `{"action":"publish_preview","assets":"dist"}`. The service
publishes only static assets to an isolated nonproduction Pages project and
returns its immutable review URL. It does not run repository code with tokens.
For a static-only app, publish the build and open it directly with `target:
"hosted"`; a local preview process or Quick Tunnel is not required. Use a local
preview when useful during development or when the app needs a local backend.
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

# Resume and report

Update task checkboxes as their work finishes. Keep demonstration and handoff
tasks open until those actions finish; do not bulk-mark every task complete
before collecting proof. Report the active phase alongside the task count.

Resume the failed operation using saved work. Rerun only checks or demos affected
by an actual edit or relevant environment change. Use the same provider operation
ID only to recover the exact same request; changed data needs a new operation ID.
Report the current action, outcome, and any blocking choice in plain language.
If a required capability or human decision is missing, return one actionable
`needs_human` question with a stable block key. The service posts it on Linear.

The PR presents the issue, approved planning/design links, behavior images and
explanations, current preview when available, and one Showboat link. Keep internal
test results and agent discussion in transcripts. The workflow does not judge
your checks, Claude's findings, or image quality. Final approval stays human.
