# Temporary environment extension: failure log

Started 17 September 2026. Scope: DEOS provisions a temporary Worker with optional
D1/R2 for a cloud implementation, retains test evidence in GitHub, and removes
the application's infrastructure after PR publication. Cloudflare agents own the
canary application and its tests. No canary has started yet.

## Baseline

The canary-tested workflow and repair work were merged in DEOS PR #138 at
`5b7bf5c2d1e90abd4f32e3ac99a2784e48d80aa3`. Local checks: 608 backend tests passed,
one skipped; 103 portal tests and 76 Python tests passed; backend/portal typechecks
and Python lint passed. Initial Python commands used a system interpreter missing
pytest/ruff; rerunning with the existing project environment passed. No code fix
was needed. GitHub CI and staging deployment are checked separately.

## Extension events

1. Local lifecycle test used `succeeded` for an attempt; the real schema requires
   `completed`. SQLite correctly rejected it. Fixed the fixture and aligned the
   failed-attempt sweeper with `interrupted`/`absolute_timeout`. The initial test
   log is `/tmp/deos-environment-tests.log` (before rerun). Typecheck also caught
   an unknown-to-URL narrowing error; fixed the checked cast. Supervisor fixes,
   no cloud app involvement.
2. Baseline PR #138 CI and its automatic staging deployment both completed
   successfully. Backend activation is still separate and has not occurred.

3. The first provider probe found that this laptop stores the credential under
   `CLOUDFLARE_TOKEN`; the initial command required `CLOUDFLARE_API_TOKEN`. Added
   support for the existing name without printing the token. No provider call
   occurred in that initial command.
4. Real resource creation succeeded. The immediate Worker health read returned
   the provider's original 404 HTML before hostname propagation. Cleanup succeeded
   and confirmed all three resource types absent. The original error and cleanup
   receipts are retained in `provider-proof.md`. Added bounded read-only health
   checks with durable errors; no uncertain app write is replayed.
5. Source review found that screenshot caption/scope logic assumed a hosted target
   was always Pages. The remote target now uses its own environment receipt.
   Supervisor workflow fix before the canary.
6. The first full regression run passed 609 tests, skipped one and failed two:
   isolated broker tests rewrote only double-quoted imports, so the new import
   could not be resolved in their temporary directory. Aligned the import with
   that existing harness and extended the browser test to cover remote screenshots.
   The focused six-test rerun passed. No provider or app failure.
7. The second real provider probe passed asserted D1 insert/read/delete and R2
   put/get/delete through the deployed Worker. It verified one version at 100%
   and confirmed Worker, database and bucket absence afterward. Evidence is in
   `provider-proof.md`. This is an adapter probe, not the full cloud-agent canary.

No full cloud-agent canary attempt yet.
