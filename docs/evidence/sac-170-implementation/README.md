# SAC-170 implementation evidence

This change implements the plan approved in [PR 106](https://github.com/sachinkundu/deos/pull/106)
and the design approved in [PR 108](https://github.com/sachinkundu/deos/pull/108).
It also retains the deployed fixes from [PR 109](https://github.com/sachinkundu/deos/pull/109),
which was still open when this branch was prepared.

## Local evidence

- `result.json`, `journal.json`, and `stdout.jsonl`: the pinned Codex 0.147.0 runtime
  runs the production hooks in the built DEOS image. Two fresh children perform
  discovery and recheck. One parent repair runs. The trusted collector verifies
  the journal against native parent events and hashed child transcripts.
  The container has no credentials and external networking is disabled. Responses
  come from a scripted server on container loopback. This proves runtime wiring,
  not model judgment or provider delivery.
- `codex-grounding.json`: the actual Codex app-server reports native live search
  and all three enabled skills with their pinned paths and digests.
- `claude-grounding.json`: Claude Code 2.1.268 reports WebSearch, Skill, and the
  three pinned skills before any provider request. This probe also runs offline
  with a synthetic invalid token. It proves startup capabilities, not account
  allowance or a completed provider review.
- `checks.md`: executable Showboat commands and their results.
- `review-panel.png` and `missing-transcript.png`: Codex Browser captures of the
  real portal components with a labeled local fixture. The fixture adds an
  independent finding, author disposition, and later head to demonstrate stale
  coverage. It is not a production run or provider screenshot.

## Rollout gate

No production deployment, D1 migration, readiness marker, test issue transition,
or provider canary was performed for this implementation.

The existing [portal release contract](../../../openspec/specs/portal-release-flow/spec.md)
requires a reviewed main commit, staging checks, and a person-controlled release
to production. SAC-170 requires that compatible portal to be live before v25
is selected. The local implementation therefore keeps v24 as the default.
The new registry is selected only when the saved readiness row names the same
compatible version currently served by the production portal service binding.
A rollback or absent marker keeps new runs on the legacy registry; frozen runs
retain their existing definitions.

After implementation review and merge:

1. Check active attempts in D1 before rolling out the backend. Apply additive
   migration `0036_bounded_review_cycles.sql` before deploying code that reads it.
2. Use the existing portal release workflow with the reviewed main SHA. Check
   staging, obtain the existing production approval, and verify the active
   production version at 100% traffic and the protected browser pages.
3. Deploy the compatible backend. Verify its active version, container image
   digest, and healthy instances. Preserve PR 109's deployed fixes if it has not
   landed separately. Do not deploy BettaView.
4. Record the verified portal version in `review_portal_readiness` for review
   schema `deos-bounded-review-v1` and transcript schema `deos-transcript-v1`.
   Read the row back. Only then can new runs select v25.
5. Start a fresh test issue through Linear MCP on an existing configured route.
   Capture the real provider delivery, D1 frozen definition, bounded cycle,
   R2 transcript owners, exact published/reviewed heads, and Human Review gate.
   Add protected browser screenshots. Stop at the human gate; do not approve it.
6. Complete task 5.3 and replace this pending rollout note with real provider
   evidence before marking delivery complete.

The task checklist leaves live delivery open. Local tests and offline probes
must not be described as provider-originated end-to-end verification.
