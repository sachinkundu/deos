# SAC-182 behavior proof

1. BettaView shows the checked Access, GitHub, and Linear identity correlation active for the scoped project.
Captured from https://deos-tmp-c4965f48437f199bd6ab1d49.skundu.workers.dev/settings; Chromium inside the implementation sandbox

   ![BettaView shows the checked Access, GitHub, and Linear identity correlation active for the scoped project.
Captured from https://deos-tmp-c4965f48437f199bd6ab1d49.skundu.workers.dev/settings; Chromium inside the implementation sandbox](images/61c5d273e54f06293430c6a5a81a5204834fe8d1aa4543ce3f5b919191a9e6d2.png)

2. BettaView shows the accepted GitHub request-changes review, Linear In Progress, and the linked workflow continued.
Captured from https://deos-tmp-c4965f48437f199bd6ab1d49.skundu.workers.dev/?pr=https%3A%2F%2Fgithub.com%2Fsachinkundu%2Fdeos-sample-project%2Fpull%2F47; Chromium inside the implementation sandbox

   ![BettaView shows the accepted GitHub request-changes review, Linear In Progress, and the linked workflow continued.
Captured from https://deos-tmp-c4965f48437f199bd6ab1d49.skundu.workers.dev/?pr=https%3A%2F%2Fgithub.com%2Fsachinkundu%2Fdeos-sample-project%2Fpull%2F47; Chromium inside the implementation sandbox](images/eff40497b39389cf39f4635a81570555c906d2053521c93a6ec97d4508b07a21.png)

3. A separate fresh browser context restores the completed continuation state from isolated D1.
Captured from https://deos-tmp-c4965f48437f199bd6ab1d49.skundu.workers.dev/?pr=https%3A%2F%2Fgithub.com%2Fsachinkundu%2Fdeos-sample-project%2Fpull%2F47; Chromium inside the implementation sandbox

   ![A separate fresh browser context restores the completed continuation state from isolated D1.
Captured from https://deos-tmp-c4965f48437f199bd6ab1d49.skundu.workers.dev/?pr=https%3A%2F%2Fgithub.com%2Fsachinkundu%2Fdeos-sample-project%2Fpull%2F47; Chromium inside the implementation sandbox](images/d799228380157f8c9989186df9cae7a956d1eb042489361adf6f79b6b6ad5eeb.png)

4. Checked account settings show verified Access, GitHub, and Linear identities with policy version 2.
Captured from https://deos-tmp-960b90f76572a9ddf32a7297.skundu.workers.dev/settings?scenario=settings; Chromium inside the implementation sandbox

   ![Checked account settings show verified Access, GitHub, and Linear identities with policy version 2.
Captured from https://deos-tmp-960b90f76572a9ddf32a7297.skundu.workers.dev/settings?scenario=settings; Chromium inside the implementation sandbox](images/da79b6d0373efb0c908907d8b737a465eea2070b1a022189d89fbcf43134ec86.png)

5. The review page presents Comment, Approve, and Request changes while the two continuation steps remain not started.
Captured from https://deos-tmp-960b90f76572a9ddf32a7297.skundu.workers.dev/?scenario=initial&pr=https%3A%2F%2Fgithub.com%2Fsachinkundu%2Fdeos-sample-project%2Fpull%2F46; Chromium inside the implementation sandbox

   ![The review page presents Comment, Approve, and Request changes while the two continuation steps remain not started.
Captured from https://deos-tmp-960b90f76572a9ddf32a7297.skundu.workers.dev/?scenario=initial&pr=https%3A%2F%2Fgithub.com%2Fsachinkundu%2Fdeos-sample-project%2Fpull%2F46; Chromium inside the implementation sandbox](images/0d26c6dd93f39c166f8cfcabb9ad7d6d184f9591962a274d3af44fbd4d078cba.png)

6. Request changes completes the GitHub review and linked Linear In Progress steps, then reports that the workflow continued.
Captured from https://deos-tmp-960b90f76572a9ddf32a7297.skundu.workers.dev/?scenario=request-changes-done&pr=https%3A%2F%2Fgithub.com%2Fsachinkundu%2Fdeos-sample-project%2Fpull%2F46; Chromium inside the implementation sandbox

   ![Request changes completes the GitHub review and linked Linear In Progress steps, then reports that the workflow continued.
Captured from https://deos-tmp-960b90f76572a9ddf32a7297.skundu.workers.dev/?scenario=request-changes-done&pr=https%3A%2F%2Fgithub.com%2Fsachinkundu%2Fdeos-sample-project%2Fpull%2F46; Chromium inside the implementation sandbox](images/e448e972318e9d85408945b78227899c068dcf92e249c3df317c91c554ed1dd5.png)

7. Approval completes both the GitHub approval and linked Linear Merging steps.
Captured from https://deos-tmp-960b90f76572a9ddf32a7297.skundu.workers.dev/?scenario=approve-done&pr=https%3A%2F%2Fgithub.com%2Fsachinkundu%2Fdeos-sample-project%2Fpull%2F46; Chromium inside the implementation sandbox

   ![Approval completes both the GitHub approval and linked Linear Merging steps.
Captured from https://deos-tmp-960b90f76572a9ddf32a7297.skundu.workers.dev/?scenario=approve-done&pr=https%3A%2F%2Fgithub.com%2Fsachinkundu%2Fdeos-sample-project%2Fpull%2F46; Chromium inside the implementation sandbox](images/37e67e15be811d96a247422902920da13259ed2bea36bb40a8fe9ee7a41aa79c.png)

8. A rejected GitHub review leaves the Linear step not started and offers a retry without reporting continuation.
Captured from https://deos-tmp-960b90f76572a9ddf32a7297.skundu.workers.dev/?scenario=github-failed&pr=https%3A%2F%2Fgithub.com%2Fsachinkundu%2Fdeos-sample-project%2Fpull%2F46; Chromium inside the implementation sandbox

   ![A rejected GitHub review leaves the Linear step not started and offers a retry without reporting continuation.
Captured from https://deos-tmp-960b90f76572a9ddf32a7297.skundu.workers.dev/?scenario=github-failed&pr=https%3A%2F%2Fgithub.com%2Fsachinkundu%2Fdeos-sample-project%2Fpull%2F46; Chromium inside the implementation sandbox](images/a4bc657745bb5ac7532e13b18ad7a3ea0709ef055ff30e74481b8f97e02e3296.png)

9. An unclear GitHub result is visibly held for a host check before any Linear transition or retry.
Captured from https://deos-tmp-960b90f76572a9ddf32a7297.skundu.workers.dev/?scenario=host-check&pr=https%3A%2F%2Fgithub.com%2Fsachinkundu%2Fdeos-sample-project%2Fpull%2F46; Chromium inside the implementation sandbox

   ![An unclear GitHub result is visibly held for a host check before any Linear transition or retry.
Captured from https://deos-tmp-960b90f76572a9ddf32a7297.skundu.workers.dev/?scenario=host-check&pr=https%3A%2F%2Fgithub.com%2Fsachinkundu%2Fdeos-sample-project%2Fpull%2F46; Chromium inside the implementation sandbox](images/56e80bdfcb6e28dda5ebb72244c6c208a141480b39db671cfeb6e1bcca41a313.png)

10. After GitHub succeeds, a Linear failure preserves the completed review and offers retry for only the task transition.
Captured from https://deos-tmp-960b90f76572a9ddf32a7297.skundu.workers.dev/?scenario=linear-failed&pr=https%3A%2F%2Fgithub.com%2Fsachinkundu%2Fdeos-sample-project%2Fpull%2F46; Chromium inside the implementation sandbox

   ![After GitHub succeeds, a Linear failure preserves the completed review and offers retry for only the task transition.
Captured from https://deos-tmp-960b90f76572a9ddf32a7297.skundu.workers.dev/?scenario=linear-failed&pr=https%3A%2F%2Fgithub.com%2Fsachinkundu%2Fdeos-sample-project%2Fpull%2F46; Chromium inside the implementation sandbox](images/c128652fadcdc3c55338ab606d16f0a5d9b250bc3d12960ffd15a01e5b964284.png)

11. A stale pull-request head keeps the review readable but disables continuation decisions pending reload.
Captured from https://deos-tmp-960b90f76572a9ddf32a7297.skundu.workers.dev/?scenario=stale-head&pr=https%3A%2F%2Fgithub.com%2Fsachinkundu%2Fdeos-sample-project%2Fpull%2F46; Chromium inside the implementation sandbox

   ![A stale pull-request head keeps the review readable but disables continuation decisions pending reload.
Captured from https://deos-tmp-960b90f76572a9ddf32a7297.skundu.workers.dev/?scenario=stale-head&pr=https%3A%2F%2Fgithub.com%2Fsachinkundu%2Fdeos-sample-project%2Fpull%2F46; Chromium inside the implementation sandbox](images/9afbfdb84a814bb59fc5aa33009060288741517ad4a4f6e99fe467e5055536e8.png)

12. An unlinked pull request remains readable while the UI explains that no open workflow gate can continue.
Captured from https://deos-tmp-960b90f76572a9ddf32a7297.skundu.workers.dev/?scenario=unlinked&pr=https%3A%2F%2Fgithub.com%2Fsachinkundu%2Fdeos-sample-project%2Fpull%2F46; Chromium inside the implementation sandbox

   ![An unlinked pull request remains readable while the UI explains that no open workflow gate can continue.
Captured from https://deos-tmp-960b90f76572a9ddf32a7297.skundu.workers.dev/?scenario=unlinked&pr=https%3A%2F%2Fgithub.com%2Fsachinkundu%2Fdeos-sample-project%2Fpull%2F46; Chromium inside the implementation sandbox](images/d6e570dc97998aa4d90c69a2d2a452ee6ed9611adc27c754d554128421614e62.png)

13. An abandoned predecessor is terminal and explains that only its replacement may continue.
Captured from https://deos-tmp-960b90f76572a9ddf32a7297.skundu.workers.dev/?scenario=abandoned&pr=https%3A%2F%2Fgithub.com%2Fsachinkundu%2Fdeos-sample-project%2Fpull%2F46; Chromium inside the implementation sandbox

   ![An abandoned predecessor is terminal and explains that only its replacement may continue.
Captured from https://deos-tmp-960b90f76572a9ddf32a7297.skundu.workers.dev/?scenario=abandoned&pr=https%3A%2F%2Fgithub.com%2Fsachinkundu%2Fdeos-sample-project%2Fpull%2F46; Chromium inside the implementation sandbox](images/0955ac9c9e1aa4d3c8906a107ec3c89ff37c2d2d80439fc68fa962af00308f47.png)

14. The replacement attempt independently shows completed GitHub and Linear steps and a continued outcome.
Captured from https://deos-tmp-960b90f76572a9ddf32a7297.skundu.workers.dev/?scenario=replacement&pr=https%3A%2F%2Fgithub.com%2Fsachinkundu%2Fdeos-sample-project%2Fpull%2F46; Chromium inside the implementation sandbox

   ![The replacement attempt independently shows completed GitHub and Linear steps and a continued outcome.
Captured from https://deos-tmp-960b90f76572a9ddf32a7297.skundu.workers.dev/?scenario=replacement&pr=https%3A%2F%2Fgithub.com%2Fsachinkundu%2Fdeos-sample-project%2Fpull%2F46; Chromium inside the implementation sandbox](images/ddfe6617d760ea9e0fa97d08c06edaeb266bcf00e63df99c4e81eafda049ac6a.png)

15. A checked-account identity mismatch blocks both provider steps before either action starts.
Captured from https://deos-tmp-960b90f76572a9ddf32a7297.skundu.workers.dev/?scenario=identity-guard&pr=https%3A%2F%2Fgithub.com%2Fsachinkundu%2Fdeos-sample-project%2Fpull%2F46; Chromium inside the implementation sandbox

   ![A checked-account identity mismatch blocks both provider steps before either action starts.
Captured from https://deos-tmp-960b90f76572a9ddf32a7297.skundu.workers.dev/?scenario=identity-guard&pr=https%3A%2F%2Fgithub.com%2Fsachinkundu%2Fdeos-sample-project%2Fpull%2F46; Chromium inside the implementation sandbox](images/4e421eee7b5a3e6a71c6939246ce50fccb6239cc7929fc8929e4fc1a093935a1.png)

16. The linked gate waits for a checked human GitHub review; both provider steps are still not started.
Captured from https://deos-tmp-960b90f76572a9ddf32a7297.skundu.workers.dev/?scenario=checked-human&pr=https%3A%2F%2Fgithub.com%2Fsachinkundu%2Fdeos-sample-project%2Fpull%2F46; Chromium inside the implementation sandbox

   ![The linked gate waits for a checked human GitHub review; both provider steps are still not started.
Captured from https://deos-tmp-960b90f76572a9ddf32a7297.skundu.workers.dev/?scenario=checked-human&pr=https%3A%2F%2Fgithub.com%2Fsachinkundu%2Fdeos-sample-project%2Fpull%2F46; Chromium inside the implementation sandbox](images/7053b35874bd54ef341ce2ca412867d0d088f2c4086ef1953ef81b445057b042.png)

<a id="evidence-727d62e7f78cc731eeea92a889b67956bbadb00688536ff67b38170523556315"></a>

# sac-182 behavior check

*2026-09-20T12:04:34Z by Showboat 0.6.1*
<!-- showboat-id: 84bb76a2-9fb4-4bbd-ab68-a872fd22377c -->

```bash
'runuser' '-u' 'deos-author' '--' 'env' '-i' 'PATH=/usr/local/bin:/usr/bin:/bin' 'HOME=/home/deos-author' 'NODE_EXTRA_CA_CERTS=/etc/cloudflare/certs/cloudflare-containers-ca.crt' 'node' '--experimental-strip-types' 'scripts/demo-bettaview-review-continuation.mjs' '/deos/output/requests/provider-app-config-1.json'

```

```output
(node:11031) ExperimentalWarning: SQLite is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
{"claim":"BettaView used the production continuation RPC and workflow transition to save the scoped GitHub review before requesting the scoped Linear move","order":["deos:prepare","deos:permit","github:review","deos:github-receipt","deos:review-ready","linear:move"],"pullUrl":"https://github.com/sachinkundu/deos-sample-project/pull/46","issueUrl":"https://linear.app/sachinkundu/issue/SAC-250/canary-test-review-choices","githubOperationId":"sac182-attempt01a0be97-app-comment-v1","linearOperationId":"sac182-attempt01a0be97-app-linear-work-v1","githubReceipt":{"response":{"id":5260523254,"node_id":"PRR_kwDOUDXKb88AAAABOY029g","user":{"login":"sachinkundu","id":233623,"node_id":"MDQ6VXNlcjIzMzYyMw==","avatar_url":"https://avatars.githubusercontent.com/u/233623?u=fd54f5f8c14d1cc09abab8b81a5e99d188320fad&v=4","gravatar_id":"","url":"https://api.github.com/users/sachinkundu","html_url":"https://github.com/sachinkundu","followers_url":"https://api.github.com/users/sachinkundu/followers","following_url":"https://api.github.com/users/sachinkundu/following{/other_user}","gists_url":"https://api.github.com/users/sachinkundu/gists{/gist_id}","starred_url":"https://api.github.com/users/sachinkundu/starred{/owner}{/repo}","subscriptions_url":"https://api.github.com/users/sachinkundu/subscriptions","organizations_url":"https://api.github.com/users/sachinkundu/orgs","repos_url":"https://api.github.com/users/sachinkundu/repos","events_url":"https://api.github.com/users/sachinkundu/events{/privacy}","received_events_url":"https://api.github.com/users/sachinkundu/received_events","type":"User","user_view_type":"public","site_admin":false},"body":"BettaView scoped provider proof: publish review before continuing Linear.\n\n<!-- bettaview:v1 eyJraW5kIjoicmV2aWV3X2J1bmRsZSIsInJldmlld0lkIjoiMDE5OTdkODktNmVlMC03MDAwLTgwMDAtMDFhMGJlOTc3ZDI5IiwicGFydElkIjoicmV2aWV3X2J1bmRsZSIsImhlYWRTaGEiOiI3ZTFlYzNmZGUyYmM4ZmM2NGUwMjQ1YTU2MDdiMDc1YzY5MTk1NTA0IiwiZXZlbnQiOiJDT01NRU5UIn0 -->","state":"COMMENTED","html_url":"https://github.com/sachinkundu/deos-sample-project/pull/46#pullrequestreview-5260523254","pull_request_url":"https://api.github.com/repos/sachinkundu/deos-sample-project/pulls/46","author_association":"OWNER","_links":{"html":{"href":"https://github.com/sachinkundu/deos-sample-project/pull/46#pullrequestreview-5260523254"},"pull_request":{"href":"https://api.github.com/repos/sachinkundu/deos-sample-project/pulls/46"}},"submitted_at":"2026-09-20T12:04:36Z","commit_id":"7e1ec3fde2bc8fc64e0245a5607b075c69195504"}},"linearReceipt":{"response":{"issueUpdate":{"success":true,"issue":{"id":"0ea73e5f-837c-4af1-9c8b-c11216146bae","state":{"id":"700c1b00-b9dd-4cfb-9d59-bd60c1d8d471","name":"In Progress"}}}}},"durable":{"review_id":"01997d89-6ee0-7000-8000-01a0be977d29","github_status":"done","linear_status":"awaiting_delivery","outcome":"active","linear_operation_id":"review:01997d89-6ee0-7000-8000-01a0be977d29:linear-state"},"attempts":[{"step":"github","scope_id":"review_bundle","generation":1,"outcome":"succeeded"}]}
```

