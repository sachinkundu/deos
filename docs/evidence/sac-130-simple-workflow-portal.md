# SAC-130 simple workflow portal evidence

Captured on 2026-08-26 from the isolated
`codex/simple-workflow-visualization` branch.

## Deployed portal

- Portal: `https://deos.voxdez.com/`
- Worker: `deos-workflow-portal`
- Active version: `edfc6156-c265-458d-8b7a-1990e2614eee` at 100 percent
- Access remains in front of the custom domain. An anonymous request returned
  `302` to the existing `deos-voxdez.cloudflareaccess.com` login boundary.
- A signed-in browser reload showed one issue in the issue rail: `SAC-130`.
  The visualization-only `SAC-131`, `SAC-132`, and `SAC-133` entries were absent.

## Durable transcript proof

- The signed-in portal opened Planning Agent run 1 from SAC-130 run sequence 3.
- The portal displayed 46 verified events and digest prefix
  `67fc1d6a7c52` in the Activity reader with no browser console errors.
- D1 selected one completed, accepted `transcript.jsonl` artifact for attempt
  `01a03852-9204-7612-bbb6-b76579f1462a`.
- The selected object was 44,634 bytes with SHA-256
  `67fc1d6a7c52b49eca2cccf9dc29d2f4bb47fd94bdee41f33e565133fb85bd58`.

## Non-mutation read-back

- The final D1 reads reported `changes: 0`, `rows_written: 0`, and
  `changed_db: false`.
- SAC-130 run 3 remained succeeded at visit 6, definition version 4, with
  `updated_at` and `terminal_at` both unchanged at
  `2026-08-25T09:55:23.740Z`.
- The R2 transcript downloaded after the portal read was byte-for-byte
  identical to the pre-deployment copy and retained the same size and digest.

## Deterministic validation

- Eight simple-workflow presentation tests passed.
- Twelve portal Worker tests passed.
- Portal TypeScript checking passed.
- The production portal build passed and contained no visualization-only issue
  keys or titles.
- Wrangler dry-run found only the D1, transcript R2, Static Assets, and expected
  non-secret Access/project variables.
