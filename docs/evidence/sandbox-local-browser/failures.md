# Local browser workflow change and SAC-246 repeat

## Preparation failures fixed by the supervisor

- Read-only preflight query referenced a nonexistent `agent_attempts.stage` column.
  SQLite rejected it (7500); corrected to the actual schema. The successful query
  confirmed no pending, starting, running or collecting attempts. No D1 writes.
- Initial broker regression imported Cloudflare runtime APIs directly in Node
  (`ERR_UNSUPPORTED_ESM_URL_SCHEME: cloudflare:`). Used the existing test pattern
  to replace only the sandbox provider boundary; the real broker/store are tested.
- New proof assertion used `artifact.key` instead of the returned `path` field.
  Corrected the assertion; the saved proof bytes match. These are test-authoring
  errors, not cloud agent failures or automatic recoveries.

## Validation so far

Final backend suite: 622 tests, 621 passed, one existing test skipped, zero failed.
Typecheck and the real Linux Chromium regression passed.
No sample application code, proposal, or design has been changed by the supervisor.

## Runtime flaw found and fixed by the supervisor

- The real Linux browser regression showed that Playwright route.continue followed
  a redirect to another localhost port without calling its filter again. The first
  symptom was ERR_CONNECTION_REFUSED instead of ERR_BLOCKED_BY_CLIENT. Replaced
  that filter with Chromium CDP Fetch interception, which checks each redirect hop.
  The regression now starts a server on the forbidden port and requires zero hits.
- The next regression reached the correct blocked redirect but immediately navigated
  again while Chromium was still displaying its error page. Corrected the test to
  reset its context before the next scenario, matching the existing demo contract.
  Original error: Navigation to /bad is interrupted by chrome-error://chromewebdata/.

These occurred in isolated local validation, before any workflow deployment or
canary restart. No automatic agent recovery is claimed.

- A local validation command was launched against the previous image tag before
  the new build finished. It failed because the new browser wrapper was absent.
  Waited for build completion before rerunning. This was supervisor sequencing,
  not a cloud runtime failure.

## Review gate compatibility fixed by the supervisor

The existing human-revision path intentionally reused its older demo review. That
would fail to exercise the independent gate for this browser replacement. Added
a browser-runtime identity to trusted candidates and reviewer context; handoff
now rejects a review of a different runtime, entering the already frozen demo gate.
Same-runtime single-response behavior remains unchanged. Regression passed.

Final backend suite: 622 tests, 621 passed, one pre-existing skip, zero failed.
Typecheck passed. The final deployed image passed the real Chromium regression
with the separate OS user before upload.

## Release validation

The final image passed the real-browser regression, including separate browser UID,
multi-hop redirects and blocked image/frame requests to the supervisor port. All
GitHub CI checks passed. The upload took roughly ten minutes; no failed upload
was observed. The canary is held while the normal gradual rollout completes.

## Cloud rollout failure fixed by the supervisor

The basic pool rejected the first image before the canary started. Cloudflare
reported ImagePullError / ImagePullRequestedDiskSizeToSmall at 07:27:40 UTC:
"the runtime failed unpacking the image because the requested disk size was smaller
than the unpacked size of the image. Try setting a larger disk size." Requested disk
was 4,000,000,000 bytes. The original provider event is in rollout-disk-error.json.
Larger pools activated successfully, but that was insufficient to start the canary.

The first image unnecessarily included headed Chromium as well as the headless
shell, npm download caches and apt caches. The supervisor changed image packaging
to Playwright --only-shell and removes installation caches in their producing
layers. The browser executable and runtime behavior are unchanged. Rebuild, browser
regression and full cloud activation must pass before retrying SAC-246. This is
manual workflow recovery, not an automatic cloud-agent recovery.

The smaller image passed the same real Chromium regression at 1 GiB memory.
Its measured root filesystem fell from 3,300,077,568 to 2,166,628,352 bytes; this
measurement excludes provider unpacking overhead. Cloud activation remains the
authoritative check against the provider disk allowance.
