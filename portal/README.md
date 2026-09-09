# DEOS workflow portal

The workflow portal has two sites:

- Production: https://deos.voxdez.com, deployed from `release`.
- Staging: https://deos-staging.voxdez.com, deployed from `main`.

Both sites use the same workflow data and backend services. Staging writes can
affect records shown in production.

Run the canonical build from the repository root with `npm run portal:build`.
Use the [staging and release guide](../docs/portal-release.md) to deploy. A main
push can update staging. Production changes require the manual release workflow.

The [BettaView app](bettaview/README.md) has its own build and deployment.
