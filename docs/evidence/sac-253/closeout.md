# DEOS work closeout — 30 September 2026

The owner accepted the normal path and asked to wrap up these three tasks. More fault and recovery checks can wait. So can tests with a second user. Failed and partial test records stay intact.

## 1. Implementation on Cloudflare — SAC-172

[PR 138](https://github.com/sachinkundu/deos/pull/138) was merged on 17 September. SAC-172 is Done. The implementation runner has since run on Cloudflare as part of the shared test work.

The live Worker runs version `2a52da43-e1aa-4b2a-a8c8-730288a0b830` at 100% traffic. This has the final fixes through commit `270a46d`. See the [closeout command record](closeout-showboat.md) for the live readback.

## 2. Shared test infrastructure with leases — SAC-253

[PR 150](https://github.com/sachinkundu/deos/pull/150) adds the shared lease. Each test gets its own apps and stores. The system checks the build, runs the test, saves proof, and cleans up. The staging base and build job were merged in PRs 151 and 153.

The site returned to **Free** at **16:09:08 UTC**. The lease is closed. All seven owned test resources were removed and checked absent. No agents are running. No lease requests are waiting. No app sessions or lease Access identities are live. Brave also showed Free.

The paused V23 author and its supervisor were stopped. Its parent workflow had already failed. The cleanup path can now save a stopped run's files, then close its lease. This run stays `failed / codex_terminated`. It has no test pass record.

Eight runner files, six proof items, and two store snapshots were saved. Their bytes and hashes match the readback. The app snapshot has 131 tables. V23 did not publish a review. The missing `result.json` is marked absent. The full errors, transcript, and stop records stay private.

- [Final D1 readback and deployment](closeout-showboat.md)
- [Read-only queries](closeout-readback.sql)
- [Retention checks](closeout-retention.json)
- [Operator stop evidence hashes](closeout-stop-retention.json)

Lease: `cab6f898b4378c58dda63ee3fedbe8c598e595bb9d339b3a9932fe2232f1f7a5`.
Attempt: `df0c12f0-b9a6-4f48-95c3-44e8557a61d6`.

## 3. BettaView review continuation — SAC-182

[PR 137](https://github.com/sachinkundu/deos/pull/137) retains the full SAC-182 work. Its tested candidate is unchanged: `869264f9b3b25701efc0c64cbd86fdbdbb7e4bd6`.

The real app passed both normal paths. GitHub saved the reviews. Linear sent signed events. Each workflow continued once:

| Review choice | GitHub receipt | Linear event | Workflow result |
| --- | --- | --- | --- |
| Request Changes | [Review 5364783086](https://github.com/sachinkundu/deos-sample-project/pull/81#pullrequestreview-5364783086), 10:10:19 UTC | Human Review to In Progress, 10:10:30 UTC | Edit path continued once, 10:11:23 UTC |
| Approve | [Review 5364920018](https://github.com/sachinkundu/deos-sample-project/pull/81#pullrequestreview-5364920018), 10:23:05 UTC | Human Review to Merging, 10:23:13 UTC | Approval path continued once, 10:23:23 UTC |

Both used the [SAC-277 test issue](https://linear.app/sachinkundu/issue/SAC-277/canary-test-review-choices). It was later set to Canceled as part of cleanup. The test PR stayed open after approval.

[Normal-path proof](sac182-golden-path.md) · [V22 audit and limits](sac182-v22-proof.md) · [Provider readbacks](sac182-v22-showboat.md)

## Checks and remaining steps

The cleanup fixes passed 35 focused tests and type checks. Strict OpenSpec checks passed too. All six CI checks passed at code commit `270a46d`. SAC-182 has six passing CI checks at its tested commit.

The deploy kept all 60 bindings, all 30 variable hashes, and all 19 secret names. No access rights or credentials changed. The author and supervisor were stopped before the deploy. The saved state still said running. The normal API then collected it.

PRs 150 and 137 are ready for review on this scope. Merge and the SAC-182 live rollout are still separate steps. The full set of 12 tests has not passed. Live release is not yet approved. The release guard stays in observe-only mode. The [task list](../../../openspec/changes/sac-253/tasks.md) keeps the deferred work unchecked.
