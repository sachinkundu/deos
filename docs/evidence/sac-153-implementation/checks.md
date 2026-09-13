# SAC-153 local implementation checks

*2026-09-13T10:16:41Z by Showboat 0.6.1*
<!-- showboat-id: ede4ad14-9d7b-4b4b-99ec-d6cc4dd82a22 -->

```bash
rtk node --experimental-strip-types portal/e2e/live-update-races.mjs
```

```output
Passed: run switching loads a new baseline; delayed issue response cannot replace current run; poll completion uses the latest mode.
```

```bash
rtk node --experimental-strip-types portal/e2e/live-updates.mjs
```

```output
{"result":"passed","apiRequests":21,"scenarios":["manual baseline","latest pending","atomic snapshot","pending promotion","cross-tab sync","reload","reopen","live polling","poll failure preservation","disable","browser isolation","invalid storage","denied storage","render failure","no preference requests"]}
```
