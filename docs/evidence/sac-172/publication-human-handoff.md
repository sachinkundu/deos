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
- The sample project's future-run route was selected through authenticated
  Settings and read back as implementation v35, route revision 21, dispatch
  enabled, with the same human reviewer and repository. The current canary
  remains frozen at compatible v36. Other project routes were not changed.

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

At 09:28:55 UTC, Sol completed its adjustment. Branch publication succeeded and
the workflow opened [implementation PR #33](https://github.com/sachinkundu/deos-sample-project/pull/33),
then reached implementation_review / awaiting_human at 09:29:21 UTC. Linear shows
Human Review with the PR attached. The PR is open and not a draft; its head is
72c46f9f2a3027600289cb60911e2857a08ee688 and it is not merged. Its 17 changed files
contain no .github/workflows file. Claude's original findings, Sol's response,
screenshots and command evidence remain in the PR. No new Claude job ran.
The authenticated staging browser shows Implementation complete, its connecting
edge to Human Review, and the Review implementation PR action pointing to PR33.
The live screenshot was captured in the supervising Codex task.

The new author chose a production rebuild and a focused comparison of unchanged
runtime files. It reports matching built asset hashes for the existing preview.
The saved npm audit command failed because its registry POST was outside the
network policy. That failure is visible in the PR and did not stop publication;
the workflow did not invent another completion or evidence gate.

The real Linear question, reply delivery, author continuation and publication
are proven. Human review remains pending. The existing calculator preview used
an authorized maintainer deployment fallback; this does not prove fully
autonomous Cloudflare deployment. SAC-182 remains stopped. No SAC-172 PR has
been opened.

The two-minute canary monitor is paused at the requested final human-review
gate. No automatic continuation or merge is scheduled.

Remote command output is recorded in
[the Showboat document](publication-human-handoff-showboat.md).
