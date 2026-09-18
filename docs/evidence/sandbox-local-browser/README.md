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
or hosted-preview ownership. TLS trusts the Cloudflare interceptor's pinned CA key
instead of accepting every server certificate.

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

- Backend and typecheck results are saved alongside this file.
- A real Linux Chromium regression tests interaction, controlled-input clearing,
  reload persistence, mobile capture, context reset, measurements, redirect chains,
  cross-origin images/frames, failed-document proof rejection and process cleanup.
- Broker/store regression tests cover immutable proof, rejected subjects/inactive
  attempts, exact owned targets and deleted environments.
- Review regression tests force a new gate after the browser runtime changes.
- [Failure log](failures.md) separates supervisor fixes from cloud-agent recovery.

Deployment, cloud canary completion and provider cleanup are pending. Local tests
are not evidence that those steps have completed.
