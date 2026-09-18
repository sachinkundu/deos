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

Backend suite: 621 tests, 620 passed, one existing browser test skipped, zero failed.
Typecheck passed. Dedicated Linux Chromium regression and deployment are pending.
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
Typecheck passed. Real Chromium regression with the separate OS user passed; final
image confirmation is being completed before deployment.
