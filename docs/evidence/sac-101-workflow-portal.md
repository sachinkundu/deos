# SAC-101 workflow portal evidence

Captured 2026-08-21 from `/Users/sachin/code/deos-worktrees/sac-101-portal`.

## Live resources

- Portal: <https://deos.voxdez.com/>
- Portal Worker version: `9f047f02-7de7-4171-aaa0-de7f71e975bf` at 100% traffic
- Queue and orchestration Worker version: `2135da21-e9c5-48bf-ac7c-17701efe8c81`
- Linear ingress Worker version: `1ca6a565-6284-4817-8896-1f647327a63a`
- D1 database: `deos-sample-project` (`4e854f8a-018a-42c4-a325-c4b8805c06b2`)
- Dispatch remained disabled during migration, backfill, and deployment.

## Authentication and exposure

- Unauthenticated `GET https://deos.voxdez.com/` returns HTTP `302` to `deos-voxdez.cloudflareaccess.com` before the Worker or D1 read path.
- The Access application audience is `c12828abda88ac73e394039f6e0b87a9bc5f2d78922463c37a72ccca55bedec7`.
- The Access application allows only the `DEOS Google` Google identity provider (`8f93ab94-bb0e-4613-ac8f-d25c8a2a21f5`) and redirects directly to it.
- The sole allow policy includes exactly `sachinkundu@gmail.com` and requires that Google login method.
- The Google OAuth web client is named `DEOS Cloudflare Access` in the `sachinkundu` Google Cloud project. Its authorized origin and callback use `deos-voxdez.cloudflareaccess.com`; no OAuth credential is stored in this repository or in the portal Worker.
- The Worker re-verifies the Access JWT signature, issuer, audience, expiry, and exact email before assets, routes, or D1.
- The portal Worker has only D1, Static Assets, and three non-secret authentication variables. Workers.dev and preview URLs are disabled.

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

- A real Google sign-in as the allowed `sachinkundu@gmail.com` account loaded the deployed portal and its SAC-122 data. The sanitized live screen is captured in `portal/qa-google-authenticated.png`.
- After logout, the Access login screen presented only `Google · DEOS Google` under the `deos-voxdez.cloudflareaccess.com` team domain.
- A real Google sign-in as `sachinindiakundu@gmail.com` reached Cloudflare Access and was denied with `That account does not have access.` The denial is captured in `portal/qa-google-denied.png`.
- The post-authentication remote D1 inventory remained 24 runs, 103 transitions, 93 attempts, 0 waits, 15 indexed issues, and 17 governed links. Its metadata again reported `rows_written: 0` and `changed_db: false`.
