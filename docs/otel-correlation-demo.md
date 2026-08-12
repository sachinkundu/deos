# OpenTelemetry correlation proof

*2026-08-12T11:35:50Z by Showboat 0.6.1*
<!-- showboat-id: de77efbe-cf49-451c-b3e9-07ab2aefd823 -->

Deterministic proof for OpenSpec task 4. This evidence covers local tests, type checking, Worker dry-run builds, and strict spec validation. It does not claim a live deployment or provider-originated event.

```bash
rtk .venv/bin/pytest -q
```

```output
.........                                                                [100%]
9 passed in 0.02s
```

```bash
rtk node --test --test-reporter=dot tests/*.test.ts
```

```output
.......
```

```bash
rtk npx --yes --package typescript tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --allowImportingTsExtensions --lib ES2022,DOM src/workflow.ts src/telemetry.ts src/queue-consumer.ts
```

```output

```

```bash
rtk npx wrangler deploy --dry-run --config wrangler.queue-consumer-ts.jsonc --outdir /tmp/deos-otel-consumer-proof
```

```output
 ⛅️ wrangler 4.121.0
────────────────────
Total Upload: 7.20 KiB / gzip: 2.19 KiB
Your Worker has access to the following bindings:
Binding                                                                          Resource                  
env.DB (deos-sample-project)                                                     D1 Database               
env.LINEAR_API_URL ("https://api.linear.app/graphql")                            Environment Variable      
env.LINEAR_HUMAN_APPROVAL_STATE_ID ("71738607-03fd-49f2-b4be-b2aac29ccd13")      Environment Variable      
--dry-run: exiting now.
```

```bash
rtk npx wrangler deploy --dry-run --config wrangler.jsonc --outdir /tmp/deos-otel-ingress-proof
```

```output
 ⛅️ wrangler 4.121.0
────────────────────
Attaching additional modules:
┌────────────────────┬────────┬────────────┐
│ Name               │ Type   │ Size       │
├────────────────────┼────────┼────────────┤
│ deos/__init__.py   │ python │ 0.20 KiB   │
├────────────────────┼────────┼────────────┤
│ deos/dispatch.py   │ python │ 5.41 KiB   │
├────────────────────┼────────┼────────────┤
│ deos/fakes.py      │ python │ 2.49 KiB   │
├────────────────────┼────────┼────────────┤
│ deos/ingress.py    │ python │ 7.34 KiB   │
├────────────────────┼────────┼────────────┤
│ deos/ports.py      │ python │ 3.64 KiB   │
├────────────────────┼────────┼────────────┤
│ deos/telemetry.py  │ python │ 1.84 KiB   │
├────────────────────┼────────┼────────────┤
│ deos/worker.py     │ python │ 0.80 KiB   │
├────────────────────┼────────┼────────────┤
│ Vendored Modules   │        │ 94.44 KiB  │
├────────────────────┼────────┼────────────┤
│ Total (34 modules) │        │ 116.16 KiB │
└────────────────────┴────────┴────────────┘
Total Upload: 125.11 KiB / gzip: 32.80 KiB
Your Worker has access to the following bindings:
Binding                                                                        Resource                  
env.QUEUE (deos-sample-project-events)                                         Queue                     
env.DB (deos-sample-project)                                                   D1 Database               
env.ARTIFACTS (deos-sample-project-artifacts)                                  R2 Bucket                 
env.LINEAR_PROJECT_IDS ("99426d9b-cda7-4db4-9136-692a95a0b090")                Environment Variable      
env.LINEAR_START_TRANSITIONS ("In Progress,Started")                           Environment Variable      
env.LINEAR_APPROVAL_TRANSITIONS ("In Progress,Started")                        Environment Variable      
env.LINEAR_REJECTION_TRANSITIONS ("Canceled")                                  Environment Variable      
--dry-run: exiting now.
```

```bash
rtk openspec validate --changes initial-architecture --strict
```

```output
- Validating...
✓ change/initial-architecture
Totals: 1 passed, 0 failed (1 items)
```
