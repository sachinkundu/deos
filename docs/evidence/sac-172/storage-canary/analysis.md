# SAC-246 workflow canary analysis

The supervised run reached [implementation PR45](https://github.com/sachinkundu/deos-sample-project/pull/45),
unmerged and unreleased. This proves a recovered workflow through publication,
not unattended reliability or an independent final approval. The trial app was
kept small; cloud agents made every application, test and demonstration change.

## Implementation gates

- Prerequisite planning and design gates consumed authorized human decisions;
  their PRs43/44 merged before implementation.
- A real publication blocker opened clarification. The supervisor repaired public
  Worker routing and answered through Linear. The reply was consumed after191seconds;
  the cloud author resumed saved work without a duplicate request.
- The independent demo review returned needs_work for incomplete selected proof.
  The workflow routed its findings to the cloud author automatically, reopened
  a checklist item, and retained the review after the response.
- Frozen v41 permits one reviewer pass and one author response. Publication after
  that response is intentional. There was no second independent pass; the final
  human gate remains open against the exact PR head and base. No final merge or
  release transition was sent.
- PR creation18:45:08 preceded resource retirement18:45:28–18:45:45. All three
  temporary Workers, D1 databases and R2 buckets are independently confirmed
  absent. Browser/sandbox cleanup recovered automatically by18:46:02.

## Automatically fixed

Cloud agents recovered dependency-version, typecheck, test-harness and application
lifecycle failures; corrected the visible CSS issue; obeyed native tool restrictions
by switching to the supported shell; and repaired task-transition and oversized
request mistakes. The demo feedback produced seven real remote scenarios plus
raw D1/R2 evidence, without supervisor application edits. Existing operation
identity prevented duplicate demo collection despite repeated waiting clients.

The service recovered a design-stage memory reset, a later Durable Object reset,
and delayed browser cleanup. Original errors remained durable. Recovery does not
prove the underlying provider causes were fixed.

## Fixed by the supervisor

The supervisor corrected rollout readiness checks after starting too early,
added safe cleanup support for interrupted attempts, and used supported same-run
retries. The supervisor fixed the broker's missing public-Worker routing flag
while no author attempts were active, then verified activation and real resumed
publication. Frozen-version/registration repairs made the extension dispatchable.

The supervisor found two design flaws (delete retry visibility and a late writer
race), sent review feedback, and verified the Cloudflare agent's revisions. These
were supervisor findings with cloud-agent implementation, not local app fixes.
Routine gate decisions and failure logging are supervision, not automatic recovery.

## Still needs fixing or verification

- Preserve native stderr as a distinct durable artifact even when an author supplies
  validation.txt. Current fallback retains one or the other. Live supervision
  rescued the first hook error; the second survived in validation.txt itself.
- Expose complete trusted provenance to the independent demo reviewer. It lacked
  per-scenario browser reset information and the proof-before-cleanup boundary;
  this produced avoidable objections despite genuine underlying execution.
- Explain the delayed gate wake and the provider memory/code-update resets.
  Recovery succeeded, but current evidence does not identify their root causes.
- Repair or diagnose the optional local preview relay's HTTP530/1016 failures.
  The remote Worker path worked and was used for all final app proof.
- Failed planning work is preserved but current continuation does not reuse its
  partial patch; a provider-quota recovery repeated planning.
- Verify portal rendering and latency visually in a future run. D1 prospectively
  showed0,1,2,4,10,14,18,25,26,27,28,30,32 and a real32→31→32 review reopening.
  Signals are incremental; some author checklist writes are batched, so perfectly
  sequential animation is not demonstrated. The initial0/32 list existed about98
  seconds before task-stage completion. This is backend evidence, not visual proof.
- The PR exposes screenshots and raw storage proof, while review findings/response
  status remain in the portal and durable workflow evidence. Do not describe the
  final candidate as independently passed. This run did not exercise an actual
  human request for revision after final PR publication or a merge/release gate.

## Evidence and limits

The final response passed16 tests, typecheck, formatting and build. Seven real
browser scenarios covered empty state, save/read/refresh/delete, fresh-context
continuity, both invalid-input messages, literal markup, capacity rejection and
final state. The capacity test used explicitly synthetic D1 reservations followed
by a real remote save rejection; it did not fill R2 with user-created content.
Raw proof records two final D1 rows and matching R2 bodies plus a deleted zero-byte
tombstone, and confirms no Overflow row. Synthetic reservations were removed.

GitHub holds nine selected images (eight unique hashes) and raw Showboat at an
immutable evidence commit. Every image returned200 without authentication and
matched its hash after all test infrastructure was removed. Connected Brave
loaded PR45 and its fresh-context image; the available browser surface did not
expose pixels, so independent supervisor visual inspection is not claimed. The
cloud author recorded inspecting the selected images. No screenshot was fabricated.

See [failure log](failures.md) for every original failure and attribution;
[final gate/resource records](final-gates-resources.json),
[frozen routing](frozen-gate-routing.json),
[provider absence](provider-absence-final.json),
[public proof readback](published-proof-readback.json), and
[final response audit](completed-demo-response-audit.json) for underlying receipts.
