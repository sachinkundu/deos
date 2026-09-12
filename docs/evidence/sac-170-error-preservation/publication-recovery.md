# Publication read-back recovery

SAC-170 completed its Claude review and author response, then failed at
`publish_design_response` with `GitHub design pull-request read-back mismatch`.
The original error and stack were retained, but the throw combined several
comparisons without recording their values.

A fresh read of GitHub PR #108 and the exact saved R2 candidate matched every
comparison: state, draft, merged, head branch, head SHA, base branch, title,
body, PR database ID, PR number, and design contents. The R2 candidate checksum
also matched D1. This supports a transient read-back inconsistency, but the
missing historical values prevent identifying which field differed then.

## Change

Planning publication, design publication, and the final design check now share
a bounded read-back helper. It makes at most four reads, with delays of 250,
1000, and 2500 milliseconds. Expected values stay fixed. The helper never
repeats writes or adopts a different head. Persistent mismatches still fail.
Unexpected transport, parsing, and boundary errors propagate unchanged.

Every mismatch records the exact original message and stack, operation and
repository, phase, attempt number, and each differing expected/actual value.
The existing protected D1/R2 diagnostic path retains these records even when a
later read succeeds. Full values are not truncated. Planning publication also
checks the final title and body, which were previously checked only before
that final read.

Validation: 391 backend tests and TypeScript checks passed. New cases cover
stale reads that converge, a persistent changed document without truncation,
closed PR rejection, unchanged transport errors, and retained diagnostics after
successful recovery. The adapter test combines a lost metadata-write response
with stale PR heads and verifies that only one write occurs. Existing tests
still reject branch changes during review replies and unsafe file paths.

Provider contract: [Get a pull request](https://docs.github.com/en/rest/pulls/pulls#get-a-pull-request)
and [Get a reference](https://docs.github.com/en/rest/git/refs#get-a-reference).
These are separate reads. The bounded consistency check is DEOS behavior;
the documents are not evidence for which field was stale in this run.

## Production

The supported publication retry reuses the accepted candidate and frozen
workflow definition. It does not allocate another author or reviewer attempt.
Deployment and live outcome are recorded in publication-recovery-rollout.md.


Worker commit `8710906` deployed as version
`2cde8efc-b6ca-4e05-b628-25e8a16a4838`, read back at 100% traffic.
`--containers-rollout none` kept the existing image and four healthy containers.
No active agent attempts were present. Neither portal was deployed.

The publication-only retry was accepted at 12:47:38 UTC, advancing visit 51 to
52 with the same frozen v24 definition. Workflow
`wf-v1-bxaau4qkcdbfe6kf62g6wrfcf3ii24ql6toiikzpz44dxawzkx4a` reused the accepted
candidate. D1 recorded the publication receipt at 12:47:49.470 UTC with head
`3a5ba08f296ecfbbc41189aa3dad1a2d9c5366f8`, matching GitHub PR #108.
No agent attempt was added and no new workflow error was recorded.

Linear entered Human Review at 12:47:53.401 UTC. D1 confirmed
`awaiting_human/design_review` at visit 53, and Cloudflare is waiting for the
human event. GitHub PR #108 remains open with six passing checks. SAC-161
remains succeeded/done. Monitoring is paused at the human gate.

This is real provider publication and durable workflow recovery evidence.
The retry had no mismatch to exercise the new bounded recheck branch; that
branch is covered by the tests above. The exact field in the old transient
mismatch remains unknown. The existing GitHub screenshot shows the same open
PR and head. A fresh portal screenshot was unavailable because the browser
required Google sign-in; Linear MCP and D1 provided the authoritative gate
readback.
