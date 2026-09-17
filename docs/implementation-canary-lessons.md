# Implementation canary contract

The calculator, SAC-225, is a workflow canary. Reaching its implementation PR is
the intended endpoint. It need not be merged or released. Its successful result
was supervised; it is not evidence of reliable unattended delivery.

These decisions from 16 September 2026 amend SAC-172. They also apply to future
small web-app canaries. SAC-182 stays parked while these canaries exercise the
platform. Its definition may be upgraded without starting its feature work.

## Agent responsibilities

Claude reads the approved proposal, specifications and design and chooses which
demonstrations are useful. The number follows the implementation. Five images
was a calculator recovery choice, not a platform quota.

Sol implements, runs useful checks, starts the application, and captures demos.
Claude reviews the first implementation once. Sol acts on its findings once,
then the workflow publishes the result for a human. The workflow stores and
routes messages; it does not assess proof coverage, image content, citation
inspection, passing tests, freshness, or whether a repair met the findings.

Accepted clarification replies stay in the run's context after the question is
closed. Later agents receive the question and answer, with their source identity.
Agents apply relevant later human direction over earlier assumptions or demo
instructions. A reply does not grant credentials or new provider authority.
Ordinary clarification resumes the author with the existing ready plan. Missing
or blocked planning returns to Demo Plan. A human revision returns to human
review after the author responds, without an automatic new review round.

## Capture behavior

A queue for individual clicks did not prevent concurrent scenarios interleaving.
The final collection therefore runs as one queued scenario-list request. Each
scenario starts with a fresh browser context, fixed target and viewport, known
test data, ordered actions and explicit screenshot checkpoints. The author owns
server fixture resets; a fresh browser does not reset a database or provider.

The app and harness remain fixed during collection. An action failure preserves
the original error and partial artifacts; the author repairs and starts from
zero. Only a completed selected gallery reaches the PR. Other captures remain
diagnostics. Descriptions name observed behavior, not intended outcomes.

Use the browser driver's replacement operation for text fields; inserting text
is not equivalent to filling a field. Inspect original captures with the native
image viewer. Do not assume an image compositor is installed.

The author can list proof with `action: status`, then submit `action: select_proof`
with the IDs in the intended PR order. This chooses the complete reviewer gallery
and Showboat records without deleting original diagnostics. It can deselect a
failed or superseded capture that was previously marked for review. The workflow
passes this selection through; it does not decide which evidence is good enough.

## Runtime and previews

The container ships `container/skills/deos-implementation/SKILL.md`. It is installed
as a native implementation skill and copied into the readable runtime guide.
The implementation prompt and command help point to it. Shell hooks and checked
commands supply the Cloudflare CA without disabling TLS verification.

Request files and scratch scripts belong outside the repository. Local app health
uses localhost. Cloudflare's service browser uses the public preview transport.
Serving only the dedicated build output avoids unnecessary watchers. A pending
tunnel is reconciled by its saved identity rather than repeatedly recreated.
Native search and the document broker provide access to current primary docs.

Wrangler runs from the runtime scratch directory, with absolute app entrypoints
and asset paths. Generated files must not enter the application snapshot.
Removing scratch files or changing ignore rules does not invalidate unchanged
served-app demonstrations. Keep that evidence rather than recapturing for a new
repository tree hash alone.

Bound shell network probes. Hosted browser and trusted publisher access do not
imply the sandbox shell has the same egress. Checks and demos have stable operation IDs. Client disconnection leaves work
observable by ID; it does not imply cancellation. Explicit cancellation stops a
running check process group or removes queued work and retains original output.
Never cancel or replay an ambiguous running browser action. Completed results
remain retrievable without another collection.
Checked shell work must not hold the browser queue: a Showboat script can call
the assigned browser and await its result. Serialize shell checks separately,
keep whole demo collections and individual browser calls on the same browser
queue, and drain both before finalizing the candidate.

Check development tools as the actual author account with its clean PATH during
image construction. A binary bundled under the provider's private directory may
still be unavailable to the author. Name supported shell editing tools in the
prompt; a laptop-native patch tool is not necessarily a cloud shell executable.

The `static-preview-v1` capability publishes saved static build files through the
trusted service. Each run gets a dedicated direct-upload Pages project, a fixed
nonproduction review branch, and immutable deployment URLs. The agent cannot
choose the account, project, production branch, bindings, secrets or Worker code.
The service retains build bytes and provider receipts, reads back the deployment,
and makes a current review URL available after sandbox cleanup. This does not
provide backend or production deployment. The separate `temporary-environment-v1`
capability provides a run-owned Worker with optional real D1/R2 bindings. The
trusted broker owns credentials and resource identities; agents receive their
own app bindings. Local workerd remains available for local checks. Real storage
proof must use the remote target. See [temporary environments](temporary-implementation-environments.md).

Pass the frozen implementation capabilities to proposal, design, review and demo
agents. A supported publisher discovered only during demo planning is too late:
the approved design may already require an unavailable CI or hosting path.
Reviewers receive the same capability description as authors. Keep unrelated
account apps and plugins disabled for all cloud agent roles; use the run's
declared tools and native documentation access.

## Recovery and progress

Retry the failed stage of the same run. Preserve its approved inputs, branch,
PR, accepted plan, completed stages, code and proof. Fresh compute may need
dependencies; it does not imply starting implementation again. Sol chooses
which checks to repeat after real edits. Publication retries reuse the candidate
without rerunning an agent. Blocked publication asks a concrete Linear question.

Provider effects use stable operation identities. Reuse one only for identical
request data. Reconcile an ambiguous write before creating another operation.
Delivery receipt and pending Queue payload are one D1 transaction. Immediate
dispatch and scheduled replay use a lease. A lost successful Queue response can
deliver the same message again; the consumer's delivery-keyed inbox makes that
harmless. Keep original errors rather than replacing them with generic failure.

Workflow replay must not repeat prior status writes. Gate repair and its inbox
acknowledgement belong in a durable step; test a replay after a later wait, not
only an uninterrupted execution. A successful signal send is not proof that the
workflow consumed it. The scheduled fallback resends an old unclaimed signal
for its current open human gate, preserving its delivery ID and decision owner.
It must not carry an old approval into a later gate or wake a retired run.

Read back both deployment state and the running instance's version. New Worker
code and a container rollout do not rewrite an existing instance's frozen code
or rendered prompts. Record which fixes the current canary can actually exercise.
If recovery requires a fresh workflow engine, first preserve its provider history
and read D1. Resume from the saved stage and verify that earlier agents do not
run again. The calculator retirement recovery exercised this distinction.

Task-file changes signal progress; heartbeat polling is fallback. A full task
count does not mean demos or publication are done. Preserve Author, Claude
Review, Prepare PR and Human Review as distinct actual stages. Use the transcript
for current commands, scenario results, elapsed work and explicit waits.

## Review packaging

Use the issue title, implementation/release statement, Linear link, approved
planning/spec and design PR links, useful behavior images and explanations, and
one Showboat link. Include the immutable preview URL when available. Images live
in the same GitHub repository under commit-pinned links; GitHub needs no DEOS login.
For public repositories, publish absolute raw image URLs. GitHub's API leaves
relative image paths unchanged, so a desktop PR page loading them does not prove
that another review client can resolve them. Read back the published Markdown and
check the image URLs without a browser session. Keep private-repository proof
under GitHub's existing authenticated rendering; never publish private images or
embed access tokens to work around a viewer limitation. Captions describe the
behavior; generated capture URLs and registration hashes stay in diagnostics.

The Showboat document contains images and explicitly selected nonvisual behavior
demonstrations. Internal command checks, unit results, browser measurements and
agent discussion stay in transcripts. Existing unclassified command captures
default to diagnostics. No supervisor cleanup should be needed to get this form.

## Repeated canaries

Completion must use the latest service-authored review context. A launch snapshot
can predate feedback handled in the same author session. Validate output sidecars
before locking a reviewed candidate. If output finalization fails after review,
restore the saved candidate and responses and finish that output step; reuse the
accepted review and keep the original failure. Do not restart the design process.

Backend-only deployment can reset live Durable Object calls even when container
rollout is disabled. Prefer a human gate or stopped stage for deployment, and
record any deployment-induced interruption in that canary's failure list.

SAC-246 exposed a second rollout boundary: the expected image and healthy pool
counts do not prove replacement is complete. A deployment with an unchanged
image still started a new basic-pool application version; the provider stopped
the planning runner during its later rollout step. Before admitting or resuming
work after deployment, require the latest rollout to be completed, its target
application version to match the current version,100% target instances and zero
old-version instances. The environment-rollout.py ready command checks this.
Read back these facts even after a backend-only repair. Provider contract:
[Container rollouts](https://developers.cloudflare.com/containers/configuration/rollouts/).

An explicit failure-hold cleanup must support all retryable terminal states:
failed, interrupted and absolute_timeout. Preserve the original failure state,
require its complete durable manifest and confirm its process is stopped before
destroying the sandbox. A retry must not require a manual D1 state change merely
to make an interrupted attempt look failed.

Use a fresh small web app in the sample project. Exercise proposal/specs, design,
implementation, real browser use, Claude's single review, and publication. Stop
at the implementation PR for the human. Track any supervisor intervention and
fix its general cause in DEOS before claiming an unattended success. Do not
silently finish the sample app locally or manually replace its evidence.

Keep the prospective [failure register](implementation-canary-failures.md) current.
Count recovered command errors too, including failures hidden by a successful
shell pipeline. Keep distinct causes, repeated occurrences, quality findings,
supervisor interventions and deliberate approval/deployment waits separate.
Compare completed runs with the same endpoint and observation coverage; an
incomplete calculator history is only a lower bound, not a percentage baseline.

A successful small canary does not prove arbitrary integrations, backend
deployment, or concurrent whole-run isolation. Test those separately when needed.
Capacity fallback remains SAC-235, outside this correction set.

## Remaining packing-canary recovery lessons

PACK-06 was caused by supervisor deployments. Read current D1 attempts before
deploying backend code, secrets or containers and use stopped gates. Disabling
container rollout does not prevent Worker/Durable Object resets.

PACK-16 mixes two lifecycles: the local app was healthy, but the public relay
was not ready. Keep the local process and its test data alive. An identical
preview request reconciles the same tunnel; changed settings do not silently
replace the app. The provider's transient DNS cause remains unknown.

PACK-19 lost the sandbox-to-broker HTTPS response (`UND_ERR_SOCKET`), not a
proven browser socket. The click may have run. Preserve the original cause and
restart the saved scenario list from zero with fixture resets instead of
silently repeating one action. The transport cause remains unknown.

PACK-25's delayed browser close was recovered by the existing reconciler. Keep
that pending resource and original error until absence is confirmed; do not
turn a completed implementation back into an author failure.

PACK-29 exposed a missed progress wake-up: one failed send needed another file
edit before it would retry. Retry transient delivery failures with backoff until
success or the attempt deadline. Stop on revoked credentials. The workflow
continues to read actual tasks; notifications never carry counts or approval.

PACK-30 exposed a dead assigned session without local recovery. Record provider
inventory and any available close reason when a browser connection fails. At
an explicit scenario reset, confirmed absence permits one replacement in the
same active attempt, with the same origins and an archived resource receipt.
Do not replace a live or uncertain session, retry a click, revive cleaned work,
or allocate indefinitely. A second session loss asks for help with saved work.
This recovers browser loss; it does not prove its original cause is eliminated.
The later provider read-back classified the actual SAC-238 loss as
`BrowserSessionEvicted`. Cloudflare defines that as infrastructure maintenance
or its own release deployment, not app code. Keep recovery separate from a claim
that the application caused a service eviction.

## Provider contracts consulted

- [Linear webhook delivery and retries](https://linear.app/developers/webhooks)
- [Cloudflare scheduled handlers](https://developers.cloudflare.com/workers/runtime-apis/handlers/scheduled/)
- [Cloudflare workflow replay rules](https://developers.cloudflare.com/workflows/build/rules-of-workflows/)
- [Pages Direct Upload](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/)
- [Pages create deployment API](https://developers.cloudflare.com/api/resources/pages/subresources/projects/subresources/deployments/methods/create/)
- Installed Wrangler 4.125.0 Pages upload implementation supplies the asset-key,
  upload-token, asset-upload and manifest contract used by the trusted publisher.

## Expense-canary execution receipts

The expense canary exposed a missing distinction between a shell yielding and
its operation completing. Status must bypass both work queues. Check and demo
requests now require stable requestId values; repeating identical input returns
the existing operation. Changed input with the same ID is rejected. Intentional
new work uses a new ID. Queued, running, completed, failed, canceled and interrupted
states retain timestamps, deadlines, exit results and original diagnostics.
Demo progress identifies its scenario and step; check progress identifies output
activity. A quiet command is not automatically classified as dead.

Use deos-implementation --wait for sequential shell dependencies. The client
returns the actual failing command exit status, while a nonblocking unfinished
submission exits75. dependsOn prevents a command starting unless named operations
completed successfully. Install dependencies through this same interface.
A fresh runtime marks previously active receipts interrupted, never silently
replays them. Current operation files are private to the trusted service;
read-only tool results expose safe execution data and image paths to the author.
The existing diagnostic journal also captures receipts for artifact collection.

Progress notification uses a fixed3second HTTP timeout in the Node watcher,
with1–30second exponential retry. This is independent of the supervisor's
30second heartbeat and the workflow's configured5minute heartbeat expiry.
Heartbeat expiry is checked by the Worker controller. Liveness and task progress
are separate signals; tolerate transient delivery errors when recovery succeeds.

A Pages asset redirect is followed only within the immutable deployment origin,
for at most3redirects and a shared20second deadline. Final size and SHA256 must
still match. Authenticated provider API redirects remain forbidden.

## Reading-canary review search

SAC-245's Claude reviewer searched `candidate/src` with `rg`. The broker had
listed frozen files but accepted only file arguments; this ordinary directory
search ended the review. Directory search now expands path prefixes only within
the frozen source inventory. It does not walk the sandbox or grant access to
unlisted files. File hashes, traversal rejection and read-only syntax still
apply. Tool help names this supported search form. Resume the failed review
from its saved app and proof; do not rerun successful demonstrations.

## Reading-canary follow-up repairs

These repairs were merged through PR138 and deployed with the temporary
environment extension on17September. Their adoption and full behavior remain
part of the SAC-246 canary; local checks alone do not establish that result.

Use the task tool to report one existing task active, completed or reopened as
work happens. It records actual file changes and timestamps; it does not decide
whether work is complete or invent intermediate progress. Adoption and portal
latency still need a live canary.

Assets-only preview defaults to the authorized hosted publisher. Backend entrypoints,
D1/R2 bindings and explicit local requests retain local workerd. Browser and demo
defaults follow the chosen preview; an explicit target remains authoritative.
The local D1/R2 bindings are emulated storage, not a remote provider deployment.

Checked shell commands fail on unhandled errors and bash pipeline failures.
Retain a tool's primary exit status through diagnostic native shell commands;
recent tool errors remain available through status and diagnostics. Do not read
private runtime files to obtain errors. Delivery telemetry reports latency and
recovery separately from task completion or portal rendering.

Cleanup must reconcile browser/provider absence, destroy the sandbox, then mark
local data and attempt cleanup. Scheduled/operator cleanup must use the same
resource hooks as normal completion. Historical local-data metadata can be
reconciled only from a recorded terminal sandbox destruction; never infer
browser/provider absence from it.

Group selected and omitted screenshots by scenario for the author to inspect.
This is descriptive evidence, not a coverage gate. Browser measurements are
diagnostic output and are not supported steps in an ordered screenshot demo.

See the [prepared repair report](evidence/sac-172/reading-canary/prepared-repairs.md)
for validation and limitations, and the [D1/R2 canary brief](evidence/sac-172/reading-canary/next-storage-canary.md)
for the backend capability required before that next run.
