# BettaView rendered selection recovery

*2026-09-14T05:27:48Z by Showboat 0.6.1*
<!-- showboat-id: 417013bd-9fd7-41a9-9e10-5a7dc49ddc27 -->

```bash
rtk proxy node --test portal/bettaview/test/selection.test.js
```

```output
✔ browser, cloud and local publication use the same selection matcher (0.514083ms)
✔ matches GitHub-rendered PR 133 paragraphs across hidden link destinations (77.86325ms)
✔ matches decoded entities, nested formatting, links and reference links on exact source lines (1.086625ms)
✔ matches across list entries without including Markdown list numbering (0.334459ms)
✔ preserves exact code content and multiline source locations (0.285084ms)
✔ rejects ambiguity and changed wording even when draft supplies plausible lines (1.793416ms)
ℹ tests 6
ℹ suites 0
ℹ pass 6
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 178.947708
```
