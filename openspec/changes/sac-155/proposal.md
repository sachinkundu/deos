## Why

Work on the portal can change the live site before it is ready. A staging site will let people test new work while the live site stays on a known release.

## What Changes

- Add a staging portal for new work while the live portal stays available.
- Let `main` change staging. Change live only when a person moves reviewed work to the release branch.
- Keep production at `deos.voxdez.com` and put staging at `deos-staging.voxdez.com`. Show a clear name on each site.
- Let both sites use the same D1 and R2 data, with the same GitHub and Linear links.
- Add a release pipeline on GitHub. Keep its workflow files in the repo. A person starts it to move reviewed work from `main` to the release branch.
- Let staging deploy from `main` through GitHub CI, a DEOS workflow, or Wrangler. Deploy production only through the GitHub release pipeline. If a check or deploy fails, keep production on its last good release.

### Non-goals

- Make a second copy of portal data for staging.
- Change how GitHub, Linear, D1, or R2 data is stored.

## Capabilities

### New Capabilities

- `portal-release-flow`: Keeps separate staging and live portal releases on one shared data set.

### Modified Capabilities

None.

## Impact

- Adds branch-based checks and deploy steps for both portal sites.
- Adds a staging site and a clear site name in the portal.
- Keeps the current D1, R2, GitHub, and Linear data links shared by both sites.
