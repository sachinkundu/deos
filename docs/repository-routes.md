# Repository routes and Settings

DEOS can manage any number of configured repository routes. One route pairs one Linear project with one repository exposed by the DEOS GitHub App. The Linear project id is the route id. A project can have one route in this version.

Linear does not supply the authoritative project-to-repository route that DEOS needs. Linear project links and GitHub issue or pull-request integrations are useful context, but they do not provide one guarded routing record with a GitHub App installation, required rights, workflow controls, and run-freezing revisions. DEOS therefore keeps that record in D1 and manages it on `/settings`.

## Settings flow

1. Open `/settings` through Cloudflare Access.
2. Select **Add route**.
3. Choose a Linear project from the live Linear app catalog.
4. Choose a repository from the live DEOS GitHub App catalog.
5. Create the route. It starts with workflow dispatch off.
6. Use **Recheck** after changing repository access in GitHub.
7. Enable workflow dispatch only after the access state is `passed`.

Project connection cards show the project, repository, workflow state, GitHub access state, and active-run count. Selecting a card opens its repository, workflow, review, and connection details.

A repository or App-install change turns off only the edited route. An active run does not block the save. Its repository, App installation, workflow gates, and review settings remain frozen. The new values apply to later runs.

Agents on different routes may run at the same time. Each attempt reads the
same protected Codex credential snapshot through its own checkout row. A
refreshed credential replaces that snapshot only when its source ETag still
matches. When another attempt already saved a valid refresh, the later writer
keeps that winner instead of overwriting it or failing the agent.

If Linear or GitHub is unavailable, saved routes remain visible. New pairing and unchecked enablement stay blocked until the live catalog or access check succeeds.

## GitHub access

The route editor can select only repositories returned by the DEOS GitHub App. DEOS does not grant access itself. Use the route's **Manage this GitHub App install** link to change selected repositories in GitHub, then return and use **Recheck**.

The required repository permissions are:

- Checks: write
- Contents: write
- Metadata: read
- Pull requests: write

The trusted queue Worker mints short-lived tokens for the route's saved App installation. Tokens and raw provider replies do not cross the internal route-admin binding or enter D1. D1 stores only safe provider ids, rights digests, results, settings links, actors, and times.

## Safe failure behavior

- Unknown or disabled Linear project: acknowledge the webhook and start no work.
- Old queued route revision or digest: record `stale_route` and start no run.
- Missing repository or weak App rights: disable only that route and start no Sandbox.
- Provider catalog failure: keep saved routes visible and return a bounded error.
- Old edit revision: reject that card's save and ask the operator to reload.
- Active route edit: save for future work and keep the active run fixed.

The full provider contract and live resource proof are recorded in `docs/evidence/sac-144-multi-repository-contracts.md`.
