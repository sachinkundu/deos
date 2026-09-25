# SAC-253 Linear Issue update contract

Observed on 2026-09-25 with the real DEOS Linear webhook and the short-lived
[SAC-259](https://linear.app/sachinkundu/issue/SAC-259/verify-shared-test-event)
canary. The endpoint was the existing `deos-sample-project` Worker. Its canary
capture version `11d60ffd-732a-47f8-90ed-952c18655ea5` was read back at
100% traffic. The capture stored only this issue's signed raw payloads in the
private artifacts bucket. After the summary was saved, all five raw capture
objects were removed and each absence was read back. The baseline ingress was
restored as version `2a11a7c4-ae33-42bf-8d48-5cef2a21b2b4` at 100% traffic.
SAC-259 was set to Canceled with the mark absent and human edit preserved. The public summary is
[sac-253-linear-contract.json](sac-253-linear-contract.json); it has field
names, hashes, actor IDs, timing, and marker presence, but no issue description.

The [Linear webhook contract](https://linear.app/developers/webhooks) says
`Linear-Signature` is HMAC-SHA256 over the raw body, `Linear-Delivery` is the
delivery key, and `Linear-Timestamp` is milliseconds. All five observed
deliveries had a millisecond header timestamp equal to the body's
`webhookTimestamp`. The received `Issue.update` payload had `data.id`,
`data.teamId`, `data.team.id`, `data.projectId`, `actor.id`, `actor.type`,
`createdAt`, `data.description`, and `updatedFrom.description` on each
description change. The existing Worker stored their delivery IDs and payload
hashes in D1 as `irrelevant`, because no test expectation or route exists yet.

The trusted DEOS app inserted a stand-alone test mark. Linear reported its
actor ID as `f010429f-7734-4f3f-9b4b-13a4abb9b4ab` and actor type as
`user`. A separate personal token made a human edit; Linear reported actor ID
`8efc07d8-0d85-430f-84e7-f51bc6833a0b`, also with type `user`. Matching
must therefore use the saved actor ID and the old/new description hashes,
rather than treating `actor.type` as an app-versus-person distinction. The
provider event showed the mark enter the new description, remain after the
human edit, and leave after the app removed only that mark. The human sentence
remained in the final read-back.

Linear normalized Markdown bullets from `-` to `*` on the first description
write. The trusted adapter must hash the provider-read canonical description,
not the submitted Markdown, before planning a later patch. A task created in
the DEOS team without a project produced no saved delivery under the current
ingress, which requires `data.project`. After the canary joined the DEOS
project, the webhook reached D1. The shared test route must admit the saved
team even when a task has no project, while preserving the existing live
project route.

This proves the provider's update and webhook shape. It does not yet prove
the new test route or a shared-site lease. Those claims require the later
SAC-182 run and its own durable receipts.
