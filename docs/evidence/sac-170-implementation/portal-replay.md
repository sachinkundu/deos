# SAC-170 native transcript to portal replay

*2026-09-13T06:03:00Z by Showboat 0.6.1*
<!-- showboat-id: 0ee2c5ef-e44d-4fbc-8c24-022e32790dd9 -->

The first replay found a real display defect: native child response_item records reached the portal, but Activity did not show the assistant text. The fix reads native payload messages and tool output blocks. Raw transcript bytes remain unchanged. These tests apply all repository migrations to local D1, store captured native probe bytes in local R2, and use the production collector and portal routes. Authentication is injected as a local test identity. Independent findings and head updates are synthetic test inputs; no external provider or production resource is involved.

```bash
rtk proxy node --experimental-strip-types --test portal/tests/bounded-review-integration.test.ts
```

```output
✔ captured native review survives real schema collection and portal transcript reads (1531.402917ms)
✔ stored review accepts one independent result and preserves coverage across later edits (1521.957042ms)
ℹ tests 2
ℹ suites 0
ℹ pass 2
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 3386.468166
```

```bash
rtk proxy npm run portal:typecheck
```

```output

> portal:typecheck
> tsc --noEmit -p portal/tsconfig.json

```
