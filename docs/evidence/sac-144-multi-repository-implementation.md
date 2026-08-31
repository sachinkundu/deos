# SAC-144 multi-repository implementation evidence

## Settings UI

The selected project connection card design shows every saved route and keeps edits scoped to the selected Linear project. A route that already has active work explains that the current run keeps its frozen repository.

![Desktop repository route settings](assets/sac-144-settings-desktop.png)

The same route list, access state, and editor work at a 390 by 844 phone viewport without horizontal overflow.

![Mobile repository route settings](assets/sac-144-settings-mobile.png)

Browser checks also selected the second card and confirmed that its editor opened. The Add route action exposed the Linear project and GitHub repository selectors, then canceled without saving.

The protected live Settings page shows both saved routes enabled with passing
GitHub App access. The crop excludes account and Access identity details.

![Live repository routes](assets/sac-144-settings-live-routes.png)

## Local verification

- Python: 31 tests passed.
- Ruff: passed.
- Worker tests: 221 tests passed.
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

## Remote deployment and concurrency proof

Migrations `0020_multi_repository_routes.sql` and
`0021_concurrent_credential_leases.sql` are applied. Queue Worker version
`b2695a38-4528-47d3-98f1-cec290ed0fa3`, portal version
`14d7898b-618b-4112-9ca2-54d09e6190f6`, and ingress version
`cdf86643-5b03-4678-9c9c-be146c1af6b2` are deployed. The remote credential
table uses `(profile_id, attempt_id)` as its primary key, and the remote
foreign-key check returns no failures.

The first route is `deos-sample-project` on GitHub App installation
`154095438`, route revision `1`, and digest
`464ec282a1af74ce8af94f4e4782ba71152af07a804721f1e2337c829b2ae846`.
The second is `deos-sample-project-2` on the same App installation, route
revision `4`, and digest
`719d1ff690232d5bb71807af7fbd49ffb04025b30a9012c7a62964be8cdd361f`.
Both access states are `passed` and both routes are enabled.

The first simultaneous start exposed an old exclusive credential lease. DEOS
had treated one protected auth profile as one agent. The repair gives each
attempt its own D1 checkout while R2 refresh writes remain conditional on the
source ETag. A losing writer accepts only a newer decryptable JSON winner; it
never overwrites that object.

The deployed D1 read-back then showed two real Codex author agents at the same
time:

| Issue | Frozen repository | Attempt | State | Source ETag |
| --- | --- | --- | --- | --- |
| `SAC-146` run 4 | `sachinkundu/deos-sample-project-2` | `01a0577a-1139-7364-ab66-463b51fd190d` | `running` | `acf2f1269c2346927821401d840296c4` |
| `SAC-147` run 1 | `sachinkundu/deos-sample-project` | `01a0577b-57f8-7ef2-87f9-205338109dde` | `running` | `acf2f1269c2346927821401d840296c4` |

Each attempt had its own `credential_leases` row. Neither startup blocked the
other. Both issues use the exact shared title required by the change. The
executable query and captured remote output are in
[`sac-144-concurrent-route-canary.md`](sac-144-concurrent-route-canary.md).

The first second-route attempt then exposed a separate checkout defect: the
Sandbox used anonymous Git transport even though the route had a frozen GitHub
App installation. DEOS now exposes only read-only Git smart HTTP through the
attempt capability. The trusted Worker validates the frozen route, adds the
short-lived App token upstream, and never sends that token into the Sandbox.
The next provider run is the proof for this repair.

During the first provider run, Settings disabled the second route at revision
`3` and restored it at revision `4`. The already allocated run kept the second
repository, revision `2`, and its original digest. This proves that an active
edit succeeds without moving the run.
