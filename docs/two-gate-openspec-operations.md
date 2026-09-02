# Two-gate OpenSpec operations

New `simple-traceability` version 18 runs have two separate approval gates.
The first gate reviews the proposal and delta specs. The second gate reviews
`design.md`. Both use the Linear state `Human Review`, but D1 stores a distinct
visit, pull request, and approved head for each gate.

## Normal path

1. DEOS publishes one planning pull request.
2. A person moves the issue from `Human Review` to `Merging`.
3. Trusted code merges the saved planning head.
4. Trusted code reads the merged pull request, default branch, proposal, and
   every accepted spec at the saved merge commit.
5. DEOS creates a fresh design Sandbox at that exact commit.
6. The Sandbox may write only the named change's `design.md`.
7. Trusted code publishes one deterministic design branch and ready pull
   request, then returns the issue to `Human Review`.
8. `In Progress` requests a new design round on the same pull request.
   `Merging` approves the saved design head and ends the run after merge
   read-back.

## Safe retry rules

- A lost plan merge reply reuses the same provider operation and pull request.
- `planning_merge_files_unproved` starts no design attempt. Repair the recorded
  merge or repository files, then retry the same verification step.
- A failed design author attempt is eligible for the existing authenticated
  stage retry only after its Sandbox is destroyed.
- A repeated design publication searches only the deterministic run branch and
  recorded pull request. It must not create a second pull request.
- A design revision must reply to each affected root human review thread. The
  reply says what changed or why no change was made. DEOS leaves the thread
  unresolved.

## Deployment and rollback

1. Disable dispatch for the sample-project route.
2. Apply migrations in numeric order.
3. Deploy the Queue consumer Worker and its Workflow binding.
4. Run the orchestration release command. It stages immutable definitions, deploys and verifies the Worker at 100% traffic, then atomically activates version 18 across the project policies.
5. Deploy the portal and confirm its Access policy still protects the API.
6. Enable only the sample-project route for the canary.

To roll back, disable sample-project dispatch first. Existing version 18 runs
must keep their frozen definition. Restore the previous default definition only
for new runs. Do not delete design rows, candidates, gate visits, provider
operations, or R2 evidence. Re-enable dispatch only after route and definition
read-back match the intended safe state.

## Proof checklist

Capture the real Linear deliveries and state changes, both GitHub pull requests,
the open design review reply, D1 run and gate rows, R2 candidate receipts,
Cloudflare Workflow status, destroyed Sandbox attempts, an empty D1 foreign-key
check, and an Access-protected portal screenshot. After the canary, disable the
sample-project route and save that read-back with the pull request evidence.
