# SAC-170 local implementation checks

*2026-09-12T16:19:42Z by Showboat 0.6.1*
<!-- showboat-id: ab1bc720-505b-4d50-ad7a-06cd4402997a -->

```bash
rtk proxy sh -ec 'npm test > /private/tmp/sac170-final-tests.log 2>&1; tail -8 /private/tmp/sac170-final-tests.log; npm run portal:test > /private/tmp/sac170-final-portal-tests.log 2>&1; tail -8 /private/tmp/sac170-final-portal-tests.log; npm run typecheck; npm run portal:typecheck; openspec validate sac-170 --strict'

```

```output
ℹ tests 403
ℹ suites 0
ℹ pass 403
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 5280.301917
ℹ tests 79
ℹ suites 0
ℹ pass 79
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1172.197042

> typecheck
> tsc --noEmit


> portal:typecheck
> tsc --noEmit -p portal/tsconfig.json

Change 'sac-170' is valid
```

```bash
rtk proxy sh -ec 'npm test > /private/tmp/sac170-final-tests.log 2>&1; tail -8 /private/tmp/sac170-final-tests.log; npm run portal:test > /private/tmp/sac170-final-portal-tests.log 2>&1; tail -8 /private/tmp/sac170-final-portal-tests.log; npm run typecheck; npm run portal:typecheck; openspec validate sac-170 --strict'

```

```output
ℹ tests 407
ℹ suites 0
ℹ pass 407
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 5251.143416
ℹ tests 79
ℹ suites 0
ℹ pass 79
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1224.644042

> typecheck
> tsc --noEmit


> portal:typecheck
> tsc --noEmit -p portal/tsconfig.json

Change 'sac-170' is valid
```

```bash
rtk proxy sh -ec 'npm test > /private/tmp/sac170-final-tests.log 2>&1; tail -8 /private/tmp/sac170-final-tests.log; npm run portal:test > /private/tmp/sac170-final-portal-tests.log 2>&1; tail -8 /private/tmp/sac170-final-portal-tests.log; npm run typecheck; npm run portal:typecheck; openspec validate sac-170 --strict'

```

```output
ℹ tests 418
ℹ suites 0
ℹ pass 418
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 5299.327292
ℹ tests 81
ℹ suites 0
ℹ pass 81
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1268.292

> typecheck
> tsc --noEmit


> portal:typecheck
> tsc --noEmit -p portal/tsconfig.json

Change 'sac-170' is valid
```
