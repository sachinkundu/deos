# SAC-144 multi-repository implementation evidence

## Settings UI

The selected project connection card design shows every saved route and keeps edits scoped to the selected Linear project. A route that already has active work explains that the current run keeps its frozen repository.

![Desktop repository route settings](assets/sac-144-settings-desktop.png)

The same route list, access state, and editor work at a 390 by 844 phone viewport without horizontal overflow.

![Mobile repository route settings](assets/sac-144-settings-mobile.png)

Browser checks also selected the second card and confirmed that its editor opened. The Add route action exposed the Linear project and GitHub repository selectors, then canceled without saving.

## Local verification

- Python: 30 tests passed.
- Ruff: passed.
- Worker tests: 216 tests passed.
- Portal tests: 31 tests passed.
- Root and portal TypeScript checks: passed.
- Generated Worker binding checks: passed.
- Portal production build: passed.
- OpenSpec strict validation: passed.
- `git diff --check`: passed.
- Wrangler dry runs: ingress, queue with container build, and portal with the `RouteAdmin` service binding passed.
- Pyright: run on the implementation branch and current `main`; both report the same pre-existing strict-mode debt. No new category is introduced by this change.

## Local route proof

The repository-route tests apply every migration to a real in-memory SQLite database. They prove route create and guarded update read-back, append-only access audits, legacy active-run backfill, frozen author/review/human-gate targets, atomic run allocation, stale route rejection, empty-only deployment seeding, and workflow-definition route digest consistency.

The provider adapter tests prove paginated Linear project and GitHub App repository catalogs, personal and organization installation settings links, safe provider errors, and permission classification. The exact live provider contract and stable test IDs are recorded in [the contract evidence](sac-144-multi-repository-contracts.md).

Remote migration, deployment, two-route provider-originated runs, and final D1 read-back are recorded separately after the local implementation commit is deployed.
