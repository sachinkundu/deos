# Repeatable browser demo collection

The calculator canary had overlapping shell scripts sending separate browser
commands. The queue serialized each click, but not each scenario. Captions
described the intended steps while captures showed interleaved state. Publishing
copied those original bytes; it did not exchange the images.

The author now saves an ordered scenario list in one `action: demo` request.
That request holds the browser tool queue until the whole collection finishes
or stops. Each scenario starts in a fresh context in the same assigned browser.
Cookies, local/session storage, DOM state and input focus reset. The viewport
and target are fixed per scenario. Server fixtures remain the author's job.

The runner awaits every action. An error stops the remaining actions and keeps
the original cause, scenario, step and partial captures in the journal. Only a
completed collection replaces the PR image list. Later exploratory screenshots
remain diagnostic artifacts. Separate capture IDs preserve captions even when
two checkpoints have identical pixels. No workflow image judge or new gate was
added; the author, Claude's existing single review, and the human assess the work.

## Verification

[The canary](browser-scenarios-canary.ts) used the actual Cloudflare Browser Run
binding and a disposable counter fixture served through a Quick Tunnel. It
used the production collector, queue and browser command code. This tests the
collector; it is not calculator proof or a full autonomous implementation run.

- Five scenario starts had value `0`, empty cookies, no local/session storage,
  one page, and one fresh context alongside the browser's empty default context.
- The first three captures showed `1`, `2`, `1`. The repeated `1` capture had the
  same image digest. A queued competing click ran only after the complete list.
- An intentional missing selector stopped at step 2. Its partial image stayed
  in diagnostics, no later scenario started, and the selected gallery was empty.
- A new request reset from zero and captured `1` successfully.

[Showboat](browser-scenarios-showboat.md) records the real command and output;
[the result](browser-scenarios-result.json) retains the sequence. The temporary
Worker, tunnel and browser were closed. Temporary probe credentials were removed.
The probe initially required two setup corrections before collection: use the
installed workerd compatibility date and pass a bare hostname to guardrails.

All 562 repository tests, TypeScript, generated bindings, strict OpenSpec
validation and the container build passed. The three queue/collection tests also
passed inside the built container. Source SHA-256 values matched the three
runtime/client files inside the image uploaded by Wrangler.

## Activation and remaining canary work

Backend `3d4d13a0-e867-48f4-9642-6c2399e1de53` is active at 100 percent.
All four container rollouts completed with image digest
`6a2005fa8d275ffb297826dfbaf77ffb6b921d206a750536df64af90c7e9c18a`.
[Read-back](browser-scenarios-activation.json) records their health and D1 state.
No portal build was needed. The staging Settings page saved sample-project
definition 38, dispatch enabled, and the same human reviewer. The immutable
definition was registered before the Settings save.

SAC-225 still waits at implementation review, visit 55, on frozen definition 36.
PR33 remains open at `72c46f9f2a3027600289cb60911e2857a08ee688`. This deployment
does not recapture its existing images or edit calculator code. Its next author
revision can use the updated runtime and request-file help. That revision still
requires the allowed human's `In Progress` transition. The requested expression
above the result (`7 − 10` above `−3`) also belongs in that agent revision.
