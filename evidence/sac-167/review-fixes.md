# Review follow-up

The online review identified three recovery gaps. All were fixed before merge.

- Save an immutable, job-bound D1 collection checkpoint before destroying the
  review Sandbox. Resume acceptance and attempt completion from this checkpoint
  before considering accepted-review reuse. This also works after the original
  attempt deadline when the provider work was already complete.
- Recheck the originating Claude receipt hashes and cleanup before reusing either
  a planning or design review. Missing or corrupted receipts stop reuse.
- Return `202 starting` for duplicate review requests and status polls while the
  winner is starting. The duplicate never changes the shared invocation to failed.

The backend suite passed all 374 tests. Regression cases cover both review phases
before and after cleanup, with missing Sandbox files and an expired deadline;
immutable checkpoint conflicts; missing/corrupted receipts; and a genuinely
concurrent startup request paused between claim and process persistence.

These are deterministic fault-injection checks, not a second provider canary.
The real provider evidence from SAC-168 remains in the canary record. Apply
migration `0033_claude_review_collection.sql` before deploying this follow-up.
