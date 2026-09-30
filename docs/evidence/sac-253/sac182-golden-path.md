# SAC-182: the normal review path works

Verified on candidate `869264f9b3b25701efc0c64cbd86fdbdbb7e4bd6` in the isolated test environment on 30 September 2026.

## Request Changes → In Progress

A reviewer saved an inline note, a reply, and a summary, then chose Request Changes. GitHub saved the review. Linear delivered the signed state-change event. The linked workflow continued along the edit path exactly once.

![Request Changes: GitHub done, Linear done, workflow continued](golden-path-request-changes.png)

GitHub review: `5364783086`. Linear delivery: `396ea354-ad32-4c4f-956a-95a807c0249f`.

## Approve → Merging

A reviewer saved two inline notes and a summary, then chose Approve. GitHub saved the approval. Linear delivered the signed state-change event. The linked workflow continued along the approval path exactly once. The disposable pull request stayed open for test cleanup.

![Approve: GitHub done, Linear Merging done, workflow continued](golden-path-approve.png)

GitHub review: `5364920018`. Linear delivery: `e8abc86a-aa09-40e1-a191-2ae26674ab7a`.

## Cleanup was verified

After this run, all seven owned test resources were removed and checked absent. The shared site returned to Free at 10:47:41 UTC. The app database, provider records, commands, and screenshots were retained before removal.

[Detailed evidence and limitations](sac182-v22-proof.md) · [Provider readbacks](sac182-v22-showboat.md) · [Saved workflow facts](sac182-v22-receipt-facts.json)

## Owner accepted this scope

On 30 September 2026, the owner accepted the normal path and asked to wrap up. The second Linear-user and GitHub-account checks are deferred. Replay, recovery, fault, and negative cases are outside this checkpoint. The full regression suite and live release remain separate work.

The later V23 test author was paused at 11:11:11 UTC, before any review publication in that attempt. Closeout retained its original failure, files, and store snapshots, then stopped the supervisor and closed the lease. All seven resources are absent. The site returned to Free at 16:09:08 UTC. See the [final closeout record](closeout.md).
