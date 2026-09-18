# Local Chromium for cloud implementation agents

The trusted implementation runtime now launches pinned Playwright/Chromium in its
own Cloudflare sandbox. Browser control uses a local pipe. Local workerd previews
use 127.0.0.1:8787; no Browser Rendering session or preview relay is allocated.
Hosted and temporary Worker targets still open the actual deployed app. Remote
D1/R2 access continues through that app and the existing storage proof tools.

The browser runs as a separate OS user, with an empty environment and a private
profile. It cannot read root supervisor credentials. Chromium's own sandbox is
disabled inside the enclosing Cloudflare sandbox. The trusted driver checks each
navigation and each redirect hop; file URLs, other origins and local control
ports are blocked. The sandbox outbound handler separately checks durable Worker
or hosted-preview ownership. TLS uses the Cloudflare interceptor's pinned CA key rather than a global certificate bypass; the real cloud HTTPS
path passed the canary verification.

Screenshots come from the root-controlled browser driver, not author-provided files.
The broker stores them with the approved design, tested base, candidate tree,
attempt and capture identity. Existing PR proof publication and resource cleanup
continue. The browser closes with its runtime; a lost browser process is never
silently relaunched to repeat an uncertain action. Historic remote-browser cleanup
code and binding remain for old resources and compatibility, but new runtimes do
not call the old browser or tunnel allocation path.

## Implementation-stage repeat

SAC-246 remains the same run and PR45. The approved proposal PR43 and design PR44
remain merged and unchanged. Approved design and tested base are both
412a3f46aacb3a970b2415509d91f2ba7ae3f77e. The frozen workflow definition is version41,
digest79533f9d41a29bc8b422b5594fc6bcde5de4546c9718f73dd56557810ac6d53f.

The normal In Progress revision transition restarts implementation_build from the
saved candidate and plan. A review of the former browser runtime cannot substitute
for checking the replacement: the candidate now records its browser runtime, and
handoff requires the prior independent review to have seen that same runtime.
Thus this repeat enters the existing independent demo gate again. Subsequent
same-runtime responses retain the frozen single-response policy. This does not
promise a second independent pass after any needs_work response.

No sample app code is edited locally. Cloud agents must rebuild/test, provision
fresh owned D1/R2 resources, capture new proof with local Chromium, complete the
implementation gates and update the same PR. Test infrastructure is deleted after
proof publication; PR screenshots remain available. Final app merge/release is not
part of this canary.

## Validation and status

- Backend: 622 tests, 621 passed, one existing skip, zero failed. Typecheck passed.
- A real Linux Chromium regression tests interaction, controlled-input clearing,
  reload persistence, mobile capture, context reset, measurements, redirect chains,
  cross-origin images/frames, failed-document proof rejection and process cleanup.
- Broker/store regression tests cover immutable proof, rejected subjects/inactive
  attempts, exact owned targets and deleted environments.
- Review regression tests force a new gate after the browser runtime changes.
- [Failure log](failures.md) separates supervisor fixes from cloud-agent recovery.

PR140 contains this runtime change. The first cloud rollout exposed an image-size
failure on the basic pools: the image exceeded their 4 GB unpacking allowance.
The image now installs only Chromium headless shell and removes package caches
in the layers that create them. See failures.md and rollout-disk-error.json.
The smaller image is now active at100% in all four pools, each with four healthy
instances and no errors. The existing workflow engine was restarted at its saved
gate so the new review handoff code is active.

SAC-246 completed the implementation-only repeat and returned to Human Review at
09:11UTC on18September. PR45 remains unmerged/unreleased at the original head.
Proposal, design, approved base and frozen workflow stayed unchanged.

The final main-flow collection completed7scenarios/11images, including loopback
rendering, owned HTTPS, fresh-context D1/R2persistence and real100object capacity
rejection. Fresh independent review accepted that proof and requested missing
failed-read/delete demonstrations. The response supplied3unique selected images
from the real deployed app using a clearly labeled synthetic inconsistent-storage
fixture. One model-capacity failure required a supervisor same-stage retry; no
second independent pass is claimed under the frozen single-response policy.

The workflow published the3new images but omitted the earlier gallery. The
supervisor restored reviewer access through a [commit-pinned evidence supplement](https://github.com/sachinkundu/deos-sample-project/pull/45#issuecomment-5727967312).
All14image URLs were read without authentication and matched their recorded hashes.
Both temporary Worker/D1/R2sets were automatically removed, independently confirmed
absent through Cloudflare's API. Both local browsers closed and all sandboxes were
destroyed. See final-provider-readback.json, supplement-public-readback.json and
completed-response-audit.json. The local read-only reader was stopped.

The [final comparison](analysis.md) separates automatic recovery, supervisor
intervention and unresolved workflow issues. This was a completed supervised
canary, not an unattended reliability pass. The separately prepared retry-policy
PR141 is not deployed. See pr-links.json for review and evidence links.
