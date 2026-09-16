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
provide backend or production deployment; backend demos use isolated workerd.

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

## Provider contracts consulted

- [Linear webhook delivery and retries](https://linear.app/developers/webhooks)
- [Cloudflare scheduled handlers](https://developers.cloudflare.com/workers/runtime-apis/handlers/scheduled/)
- [Cloudflare workflow replay rules](https://developers.cloudflare.com/workflows/build/rules-of-workflows/)
- [Pages Direct Upload](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/)
- [Pages create deployment API](https://developers.cloudflare.com/api/resources/pages/subresources/projects/subresources/deployments/methods/create/)
- Installed Wrangler 4.125.0 Pages upload implementation supplies the asset-key,
  upload-token, asset-upload and manifest contract used by the trusted publisher.
