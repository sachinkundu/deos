# Release checkpoint — 20 September 2026

The user authorized publishing all work from this canary workflow task, syncing
main, updating staging, and releasing production through GitHub Actions.
The release remains blocked by the session's tool approval policy.

## Committed locally

Integration commit `b1ad7e369abc6b76bb93db29447bf9562e30d381` merges the
provider retry branch into the evidence checklist branch without conflicts.
It includes these previously published PR heads and the checklist commits:

| Work | Commit | Remote state observed today |
| --- | --- | --- |
| Temporary Worker, D1 and R2 environments, PR 139 | ed75b6d2f02d81325d7ccc0cf91330e48cbe61f6 | Open draft; CI passed |
| Sandbox local browser, PR 140 | 4b606a79b6ba866537fced033326b1c21e492baa | Open; CI passed |
| Same-session provider retries, PR 141 | fe1779e403b1c9b7a2cb3b014c4c2dbd299b2093 | Open draft; CI passed |
| Evidence preservation and checklist | fde7367, dbbf3eb, 55d23c4 | Local only |

The source worktrees have no uncommitted source changes. Dependency symlinks
are local setup and are excluded from the integration clone's Git status.
No sample application code was changed.

## Validation of the combined source

- 43 focused evidence, recovery, provider retry and artifact collection tests
  passed; the complete output is in release-integration-tests.log.
- `npm run typecheck` passed.
- `git diff --check` against main reported whitespace in retained raw evidence
  only. Its original output is in release-whitespace-check.log. Those archived
  provider outputs were preserved, not reformatted.
- The earlier full-suite restriction and native Node assertions remain recorded
  in failures.md. The combined source still requires CI on Node 22.

## Remote state and exact blocker

GitHub reads confirmed main is still
`5b7bf5c2d1e90abd4f32e3ac99a2784e48d80aa3` and release is still
`f2b994131d879967940e69ced07932dfffb8bc9a`.

Creating `codex/evidence-checklist` through the GitHub connector returned:

> MCP tool call requires approval, but approval policy is never

No remote branch was created. No PR was merged, no deployment was started, and
no production workflow was dispatched. The session cannot request an approval
override. Current live Cloudflare versions and active D1 attempts were not
verified in this release attempt; historical canary receipts are not a current
deployment check.

## Remaining release work

1. Publish the combined branch and run CI. Reconcile PRs 139, 140 and 141 against
   the final integration so no work is dropped, then land the reviewed source
   on main. Re-read main before proceeding.
2. Before replacing the backend or containers, read D1 and confirm no pending,
   starting, running or collecting attempts. Deploy the combined backend/runtime
   with the existing safe rollout procedure. Verify all pools, container digest
   and 100 percent Worker traffic. Do not assume a portal release deploys these.
3. Let main's `Deploy portal staging` workflow complete. Verify the exact source
   SHA at 100 percent traffic and open the affected SAC-246 workflow route to
   check compatibility with shared D1 records.
4. Confirm the staging/production Cloudflare credentials, Access service-token
   inputs and reviewer assertion/binding required by portal-release.yml exist.
   Do not print secret values. A prior release failed at the reviewer assertion
   gate; its existence must be checked for this release.
5. Dispatch `Release portal production` from main with `reviewed_sha` set to
   that full, verified main SHA. The workflow repeats staging and browser checks,
   saves the checked assets, promotes release, and deploys that artifact. Do not
   substitute a direct production deployment or manually bypass its gates.
6. Verify the completed workflow, production source SHA, 100 percent traffic,
   and the live workflow route. Record the run URL and provider readback.

This checkpoint records preparation, not a completed release.
