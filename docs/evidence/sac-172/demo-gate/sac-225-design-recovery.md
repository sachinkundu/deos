# SAC-225 design collection recovery

At 15:14 UTC on 15 September 2026, the native recheck marked both design
findings fixed. Its JSON evidence was invalid: three sources were paired with
`not_searched`, and source locators did not name the claims that used them.
The validator correctly rejected that result. The checked design was intact.

The failure collector stopped the supervisor before its private parent
transcript was copied into the output directory. It saved the review journal
and original fault, but could not verify the bounded continuation without the
parent transcript. The run entered `review_reconciliation` at visit 12.

The private live reader had captured the parent transcript at
`2026-09-15T15:14:36.215Z`, before shutdown. The production journal verifier
accepts those unchanged bytes against the durable journal and candidate.

- Parent transcript SHA-256: `8128c9608923b5e5d0054574b1e95d21837dd09958142660b50b25992e760eb4`
- Parent transcript bytes: 158695
- Checked candidate digest: `3e2b6cdb9e904fbc8b57d4f944359ed436f27ce3f4f830470e8ee1234b4fec00`
- Discovery accepted; one repair checked; one recheck invocation failed.
- Exactly one recheck invocation remains. No review result has been changed.

The fix preserves the private parent stream during failure collection and
clarifies the recheck source contract. A guarded operator endpoint can attach
a previously observed transcript to this specific missing-evidence failure.
It verifies the journal, candidate, frozen job, run, and remaining slot before
writing an audit record. The original manifest and failure remain intact.
The existing stage retry then records the transition from reconciliation to
the same author stage. It cannot grant another repair or approve the work.

Local checks: 533 backend tests passed, including source rejection, interrupted
capture, audit replay, stale-run rejection, and same-definition retry. Backend
types and generated Worker bindings passed. These are local checks. Live
recovery and calculator demo acceptance are separate proof obligations.

The resumed author accepted its recheck and exited at 15:55 UTC. It omitted
`design-dispositions.json`, so normal collection failed after storing some
outputs. Failure collection then reused those object keys. D1 rejects that
collision because each artifact key belongs to one manifest.

Failure collection now uses its own versioned prefix and manifest. Existing
normal and partial failure receipts remain intact. Recovery also recognizes
an accepted recheck as output finalization; it grants no further review or
semantic repair. A real SQLite regression covers partial normal collection,
failure capture, preservation of prior receipts, and replay.

At 16:09 UTC, the read-only Sandbox process API confirmed that the supervisor
had exited with code 0. The live reader saved the final transcript and review
journal. The production verifier accepted that journal with the original
audited continuation: both findings are fixed, no finding remains open, and
the checked candidate digest is unchanged. All 534 backend tests, TypeScript,
and generated binding checks pass for the collection fix. Deployment and
successful workflow recovery still need separate read-back evidence.
