# Author task checklist popup

*2026-09-15T04:13:38Z by Showboat 0.6.1*
<!-- showboat-id: 1e9463f4-c09c-4f65-b070-7d583084bdc5 -->

```bash
rtk proxy node --experimental-strip-types --test tests/implementation-progress.test.ts portal/tests/implementation-tasks.test.ts
rtk proxy npm run portal:typecheck
rtk proxy npm run typecheck
rtk proxy npx --no-install openspec validate sac-172 --strict

```

```output
✔ OpenSpec checklist preserves sections, numbering and wrapped text while excluding examples (1.224334ms)
✔ protected task popup reads the exact observation, rejects stale fallback and corrupt snapshots (120.00875ms)
✔ checklist counts ignore code examples, accept checked case, and allow reopening tasks (1.268083ms)
✔ progress read uses author permissions, rejects truncation and retains original transport errors (2.745042ms)
✔ live counts are scoped to the current try and base, reject old observations, and never change workflow status (96.216583ms)
✔ real file notifications signal task changes and atomic replacements before the heartbeat (4655.124917ms)
ℹ tests 6
ℹ suites 0
ℹ pass 6
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 4875.231167

> portal:typecheck
> tsc --noEmit -p portal/tsconfig.json


> typecheck
> tsc --noEmit

Change 'sac-172' is valid
```

The full backend suite passed 488 tests and the portal suite passed 93 tests before final visual polish. The focused checks above passed after the popup changes.

Codex Browser verified a temporary local fixture using the real meter and dialog components. All, Remaining and Done filters showed 6, 4 and 2 matching tasks. Enter opened the dialog; Tab and Shift-Tab stayed inside it; Escape returned focus to the counter. Loading, retry and readable error states worked, with the original stack retained in browser diagnostics. At 390 by 844 pixels, dialog and list widths were both 368 pixels with no horizontal overflow. The fixture files were removed after verification.

![Local fixture with completed and remaining tasks](task-checklist-fixture-desktop.png)

![Local fixture at mobile width](task-checklist-fixture-mobile.png)
