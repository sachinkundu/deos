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

8. All extension CI jobs passed. Backend rollout installed migration0053 and
   activated version6587a7d1 at100%. A gradual container rollout initially showed
   old images in the implementation pools; this was observed rollout progress,
   not a failed canary. We waited until all four pools were healthy on48e32b0b.
9. The temporary RouteAdmin client's first read returned provider403/error1010
   with Python's default user agent. The existing diagnostic user agent made
   the same read succeed. No mutation occurred; exact terminal error retained.
10. Selecting the new implementation definition before its scheduled registry
    update failed with `D1_ERROR: FOREIGN KEY constraint failed: SQLITE_CONSTRAINT
    (extended: SQLITE_CONSTRAINT_FOREIGNKEY)`. The policy remained v39. Cause:
    RouteAdmin loads the new bundled v41 before the scheduled handler has stored
    it in workflow_definitions. Wait for the normal registry update, then retry
    through RouteAdmin with a fresh revision. Do not insert D1 rows manually.
    This is a preflight operator error and a remaining admin timing gap, not an
    application failure.

11. The copied read-only transcript helper initially failed provider validation:
    `D1 binding 'DB' references database '4e854f8a-018a-42c4-a325-c4b8806c06b2'
    which was not found` (10181). A broad local port replacement also changed
    matching digits inside the database ID. Restored the exact known database
    ID in the private helper. No database was changed. Original Wrangler log:
    `/Users/sachin/Library/Preferences/.wrangler/logs/wrangler-2026-09-17_13-23-33_523.log`.
    This is a supervisor setup mistake, separate from cloud-agent failures.

12. Scheduled registration at13:15 and13:30 failed with the original error
    `workflow definition version already exists with another digest`. This is
    why v41 never appeared; the initial timing-only explanation in event10 was
    incomplete. The shared planning prompt changes affected both traceability
    variants and their bounded variants while their version numbers stayed at
    already-frozen values. Compared every local digest to remote D1. Assigned
    new versions26/27 without touching stored definitions or active runs. Added
    a rollout preflight that refuses any conflicting bundled version. Also made
    RouteAdmin register the selected new implementation definition using the
    existing immutable store before changing the policy, removing the scheduled
    timing dependency. Original provider stacks and timestamps are preserved in
    registry-errors.json. Supervisor workflow repair; no canary app was touched.
13. The new RouteAdmin regression initially used an incomplete local repository
    route and correctly failed `repository route is incomplete`. Added the
    fixture's project name and installation ID. The corrected36-test targeted
    suite and typecheck pass. Test verifies a pre-registration selection works,
    frozen runs stay unchanged, and conflicting version reuse remains rejected.
    Initial and final test logs are retained separately.

14. RouteAdmin selection succeeded with the deployed repair. The first enable
    request then returned `stale_workflow_revision`: the supervisor sent route
    revision28, but saveWorkflow expects workflow revision21. D1 confirmed no
    state change. Corrected that request using the supported method's contract.
    This is a supervisor request error, not an app or storage failure.

The corrected full suite passed614 tests with one skipped. Backend5a65c8a2 is
at100%; all four pools serve48e32b0b. Definition41 is now registered through
RouteAdmin without waiting for cron. See registry-activation-final.log.

15. Local evidence edits had a rejected patch hunk referencing absent text;
    no file was changed. Corrected the patch. Two earlier local source lookups
    named nonexistent workflow/test paths; subsequent source discovery found
    the correct files. These are operator-only errors, excluded from canary counts.

SAC-246 started through real Linear Todo at13:37:18UTC. Its failure log now lives
under ../sac-172/storage-canary/. Preflight events above stay separate from the
cloud-agent failure count. No supervisor canary application code was written.
