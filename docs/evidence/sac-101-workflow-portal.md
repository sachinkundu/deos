# SAC-101 workflow portal evidence

Captured 2026-08-21 from `/Users/sachin/code/deos-worktrees/sac-101-portal`.

## Live resources

- Portal: <https://deos.voxdez.com/>
- Portal Worker version: `6dd3221d-b13f-4207-9065-6992e9db3b6a` at 100% traffic
- Queue and orchestration Worker version: `2135da21-e9c5-48bf-ac7c-17701efe8c81`
- Linear ingress Worker version: `1ca6a565-6284-4817-8896-1f647327a63a`
- D1 database: `deos-sample-project` (`4e854f8a-018a-42c4-a325-c4b8805c06b2`)
- Dispatch remained disabled during migration, backfill, and deployment.

## Authentication and exposure

- Unauthenticated `GET https://deos.voxdez.com/` returns HTTP `302` to `lausac.cloudflareaccess.com` before the Worker or D1 read path.
- The Access application audience is `c12828abda88ac73e394039f6e0b87a9bc5f2d78922463c37a72ccca55bedec7`.
- The sole allow policy includes exactly `sachinkundu@gmail.com` and requires the account's one-time-PIN identity provider.
- The Worker re-verifies the Access JWT signature, issuer, audience, expiry, and exact email before assets, routes, or D1.
- The portal Worker has only D1, Static Assets, and three non-secret authentication variables. Workers.dev and preview URLs are disabled.
- A Google Workspace identity provider was not added because this account has no Google OAuth client credentials; the existing one-time-PIN provider is used instead.

## Durable state

The additive migration applied successfully to remote D1. The post-deployment read-only inventory returned:

| Record | Count |
| --- | ---: |
| Runs | 24 |
| Transitions | 103 |
| Attempts | 93 |
| Waits | 0 |
| Indexed Linear issues | 15 |
| Governed work links | 17 |
| Ambiguous attempts deliberately left unlinked | 2 |

The D1 result metadata reported `rows_written: 0` and `changed_db: false`. The four pre-migration business counts (runs, transitions, attempts, waits) remained `24`, `103`, `93`, and `0` after deployment.

## Verification

- 109 existing TypeScript tests passed.
- 5 portal tests passed, including Access JWT validation, auth-before-routing, read-only SQL inventory, exact-digest manifest coverage, and polling staging.
- 17 Python tests passed, including the complete additive migration chain.
- Root and portal TypeScript checks, generated binding check, Ruff, npm audit, production build, three Wrangler dry-runs, local Worker startup, OpenSpec strict validation, and local full migration apply passed.
- The compiled interface was checked at 1728 x 1003 and 390 x 844. The approved two-row direction, themes, interactions, responsive behavior, and reduced-motion behavior passed visual QA in `portal/design-qa.md`.

The authorized live portal screen still requires the operator to complete the one-time code sent by Cloudflare Access; no mailbox access or authentication bypass was used for evidence collection.
