# Human help when publication is blocked

Source commit: e5bb28c. Recorded 16 September 2026.

When finished implementation cannot be written to its branch or published as a
PR, the workflow keeps the saved work and original provider error, posts a
question on Linear, and waits for the bound human. A new human reply goes to Sol
with the saved implementation and evidence. Claude is not called again. The
final implementation PR still requires human review.

The portal shows this as a publication wait with Author complete. Answering the
question starts an Author continuation; it does not silently retry or approve
the work. Agent-reported questions continue to use the existing clarification
path. Auth, branch ownership and artifact storage integrity remain enforced.

## Checks and activation

- Backend: 558 tests passed; portal: 103 tests passed.
- Backend and portal type checks, portal build, strict OpenSpec validation passed.
- Backend version 8b3b8e71-d732-4140-b832-7261b72640da: 100% traffic.
- Staging portal version a7aa4e85-1a53-4cee-b9da-72f15cae008c: 100% traffic.
- Runtime image remains sha256:062e5dec9a2d502449a8ccddce62f718be94fc8e16cf5be2642cf308b6456445.
- All four container rollouts completed. No production portal deployment or
  GitHub App permission change was made.

## Real calculator handoff

The user chose to omit the extra GitHub Actions deployment workflow and publish
the calculator PR. The previous permission request is obsolete.

The existing audited publication retry migrated SAC-225's frozen implementation
tail from v33 to compatible v36, preserving its job/model contracts and final
human gate. The initial retry only repeated publication; no author was started
until the human reply arrived.

At 09:17 UTC, GitHub's retained POST /git/trees HTTP 403 led to a question from
DEOS Workflow on [SAC-225](https://linear.app/sachinkundu/issue/SAC-225/build-a-simple-web-calculator).
Question comment: 112c4314-3041-45b7-9158-f6fb675df138.

The user's instruction was relayed through Linear as comment
8899fb25-d368-420f-99c7-24e67c3065e6 at 09:20:42 UTC. Linear identifies its author
as Sachin Kundu. The real provider's Comment.create delivery was processed at
09:21:02 UTC; D1 records the question answered and the transition to Author.
Sol attempt 01a0a985-13f2-7609-b430-ee28d99451f6 began at 09:21:06 UTC.

Read-only observation of the running agent at 09:23 UTC showed it restored all
18 saved files, removed .github/workflows/pages-preview.yml, and marked task 7.1
as intentionally omitted at the human's request. It preserved the calculator
code and prior demo evidence. The live staging portal showed Author running
with 24/25 tasks, reflecting the omitted task. This is a progress observation,
not a claim that the PR is already published.

The real Linear question, reply delivery and agent continuation are proven.
Publication and final human PR review remain pending. The existing calculator
preview used an authorized maintainer deployment fallback; this does not prove
fully autonomous Cloudflare deployment.

Remote command output is recorded in
[the Showboat document](publication-human-handoff-showboat.md).
