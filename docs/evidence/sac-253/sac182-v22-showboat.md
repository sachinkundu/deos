# SAC-182 V22 provider readbacks

*2026-09-30T10:46:45Z by Showboat 0.6.1*
<!-- showboat-id: 995a81b4-2ac5-47dd-900f-6dfed728d78c -->

Live readbacks of disposable PR 81. These record the retained provider objects, including fixture setup records. The separate audit links app records to signed Linear events. This blocked run does not prove all scenarios passed.

```bash
rtk proxy gh api --paginate 'repos/sachinkundu/deos-sample-project/pulls/81/reviews?per_page=100' --jq '.[] | {id,userId:.user.id,commitId:.commit_id,state,submittedAt:.submitted_at}'
```

```output
{"commitId":"369f4a39ac204baff27b19360299b71cd03d6d2d","id":5364635222,"state":"COMMENTED","submittedAt":"2026-09-30T09:56:48Z","userId":233623}
{"commitId":"369f4a39ac204baff27b19360299b71cd03d6d2d","id":5364729696,"state":"COMMENTED","submittedAt":"2026-09-30T10:05:12Z","userId":233623}
{"commitId":"369f4a39ac204baff27b19360299b71cd03d6d2d","id":5364781755,"state":"COMMENTED","submittedAt":"2026-09-30T10:10:12Z","userId":233623}
{"commitId":"369f4a39ac204baff27b19360299b71cd03d6d2d","id":5364783086,"state":"CHANGES_REQUESTED","submittedAt":"2026-09-30T10:10:19Z","userId":233623}
{"commitId":"369f4a39ac204baff27b19360299b71cd03d6d2d","id":5364920018,"state":"APPROVED","submittedAt":"2026-09-30T10:23:05Z","userId":233623}
```

```bash
rtk proxy gh api --paginate 'repos/sachinkundu/deos-sample-project/pulls/81/comments?per_page=100' --jq '.[] | {id,parent:.in_reply_to_id,userId:.user.id,commitId:.commit_id,path,line,createdAt:.created_at}'
```

```output
{"commitId":"369f4a39ac204baff27b19360299b71cd03d6d2d","createdAt":"2026-09-30T09:56:49Z","id":4143316867,"line":2,"parent":null,"path":"canary-review.md","userId":233623}
{"commitId":"369f4a39ac204baff27b19360299b71cd03d6d2d","createdAt":"2026-09-30T10:05:13Z","id":4143389828,"line":2,"parent":null,"path":"canary-review.md","userId":233623}
{"commitId":"369f4a39ac204baff27b19360299b71cd03d6d2d","createdAt":"2026-09-30T10:10:12Z","id":4143430591,"line":2,"parent":4143389828,"path":"canary-review.md","userId":233623}
{"commitId":"369f4a39ac204baff27b19360299b71cd03d6d2d","createdAt":"2026-09-30T10:10:19Z","id":4143431600,"line":2,"parent":null,"path":"canary-review.md","userId":233623}
{"commitId":"369f4a39ac204baff27b19360299b71cd03d6d2d","createdAt":"2026-09-30T10:23:05Z","id":4143538778,"line":2,"parent":null,"path":"canary-review.md","userId":233623}
{"commitId":"369f4a39ac204baff27b19360299b71cd03d6d2d","createdAt":"2026-09-30T10:23:05Z","id":4143538782,"line":2,"parent":null,"path":"canary-review.md","userId":233623}
```
