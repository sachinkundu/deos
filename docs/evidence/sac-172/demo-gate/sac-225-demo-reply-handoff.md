# Preserve clarification through Demo Plan

SAC-225's signed clarification reply resumed the v30 workflow at Demo Plan
visit 34. That reviewer completed successfully and Codex started at visit 35.
The new author restored cumulative patch
`4186436ba4ee6d86b2e2d2d6c1a2e8c5cd52325344881868943a45c32c37ccec`
and the 25/25 checklist. Its frozen input had both `question: null` and
`reply: null`, however.

`ImplementationDemoService.accept` closed all answered questions when a Demo
Plan returned ready. `ImplementationService.materialize` then could not find
the reply for the author. Plan acceptance now leaves the answered question
available. Build acceptance already closes it after the author addresses it.
Demo Gate's existing terminal handling remains unchanged.

The regression test seeds a checked answer, accepts an actual saved plan through
the service and its D1/R2 fixture, then reads the still-answered question and
hash-checked reply. It failed before the fix with an absent question. It passes
after the fix. All 554 backend tests pass, and TypeScript checking passes.

This change is local and has not been deployed. The current author is healthy,
so backend deployment must wait until no active attempt would be interrupted.
Its already-frozen context cannot be repaired by a deployment.

## Remaining canary evidence concerns

The refreshed plan has 14 scenarios and payload SHA
`38675909e511a44f300edc6752d23c1f706a89180e5a8760948d234217f2962f`.
Two statements require review before treating the canary as accepted:

- Its summary says no Pages deployment is demanded. The approved design
  explicitly requires the non-production `review-sac-225` Pages deployment,
  an immutable URL, an HTTPS smoke test and evidence captured against that
  preview. Local workerd proof alone does not satisfy that design.
- New scenario 14 asks the author to end a browser session and obtain a new
  one. The trusted runtime allows one assigned browser per try. The original
  clarification requested operational recovery from a provider eviction;
  it did not add browser-infrastructure failure testing to the calculator.

These concerns have not been silently removed from the saved plan. No saved
scenario, approved artifact, evidence requirement or human gate was changed.
The runtime constraints and the approved preview obligation must be reconciled
through the normal durable workflow before final acceptance.
