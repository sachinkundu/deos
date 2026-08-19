# SAC-121 source reconciliation

## Baselines

- Deployed SAC-92 source: `4b6d08821780bd9b33e505b01930e106cc37f738`
- Reconciliation base: `b51abc36c5693e03e427b03780027a70a0b922e6` (`origin/main`)
- Reconciled workflow definition: version 11

This is a source reconciliation, not new deployment evidence. The historical
provider proof and its two screenshots are retained byte-for-byte from
`4b6d088`; they prove the deployed SAC-92 branch only.

## Commit-level result

Every runtime, schema, test, task, documentation, and evidence file introduced
by `4b6d088` is present in the reconciliation. There is no material omission.
The following files are byte-identical to the deployed commit:

- `src/deos-workflow.ts`
- `src/workflow-completion-reconciler.ts`
- `openspec/changes/separate-executor-and-business-lifecycle/tasks.md`
- `docs/evidence/sac-92-lifecycle-provider-proof.md`
- `docs/evidence/cba58dac-2026-08-17.png`
- `docs/evidence/d14cb989-2026-08-17.png`

The remaining differences are deliberate integration necessities:

| Area | Difference from `4b6d088` | Reason |
|---|---|---|
| D1 migrations | The deployed lifecycle migration retains its recorded name `0007_explicit_business_lifecycle.sql`; the later mainline migration remains `0007_workflow_visit_identity.sql`. Lexical order applies lifecycle first and visit identity second. | The live D1 ledger already records both names. Renumbering the deployed migration caused Wrangler to replay it against its own existing tables; retaining both immutable names is required for deployed-ledger compatibility and still yields the combined schema on a fresh database. |
| Active graph | `config/workflow.deos.yaml` is version 11 and retains main's native OpenSpec agent jobs, final mechanical archive, and absence of deploy/release-finalization nodes. Final approval rejection now reaches `denied`; terminal and failure nodes use the SAC-92 typed lifecycle. | SAC-106, SAC-111, and SAC-112 are later reviewed mainline behavior. Reintroducing the version 4 graph would regress those changes. |
| Transition commit | `src/orchestration-store.ts` combines durable waits, typed terminal causes, and premature-completion state with visit-aware compare-and-set and exact transition replay. Wait consumption also advances the visit sequence and records the traversal ID. | The deployed lifecycle and the later repeated-edge identity fix must be one atomic business-state contract. |
| Orchestration | `src/workflow-orchestrator.ts` keeps deterministic visit-scoped Workflow step names and traversal IDs while adding SAC-92 wait/resume/cancel and typed failure behavior. | A later genuine pass over the same graph edge must remain distinguishable from an exact replay. |
| Frozen definitions | `src/workflow-definition.ts` supports both the deployed typed version 4 shape and immutable parallel-mainline versions 4–10 with legacy terminal shapes. New version 11 definitions require the explicit lifecycle contract. | Both histories used overlapping definition numbers before reconciliation. Shape-and-digest restoration preserves existing runs without allowing new ambiguous terminals. |
| Workflow binding | `src/queue-consumer.ts` passes the generated `Workflow` binding directly to the completion reconciler instead of using the deployed commit's double cast. | Current generated Workers types structurally satisfy the read-only status contract, so the cast would hide binding drift. |
| OpenSpec receipts | `src/sandbox-controller.ts` and `src/workflow-evaluator.ts` retain main's receipt-free success rule only for typed repository-local OpenSpec jobs; any attempted external operation still requires exact D1-backed receipts. | This is the later SAC-106 contract and avoids recreating the unavailable synthetic `openspec.*` receipt adapter from the SAC-92 branch. |
| Tests | Lifecycle tests are combined with main's visit, cumulative-patch, and native OpenSpec tests. Migration tests apply the two immutable `0007` files in lexical order and verify the final combined schema; frozen-definition tests cover deployed typed v4 and legacy v10 shapes. | The reconciled assertions cover the combined contract, including both fresh-database ordering and the already-applied live migration ledger. |
| Documentation | Architecture, authoring, and deployment documents describe version 11 and the retained native OpenSpec tail while adding SAC-92 D1 lifecycle authority, waits, and premature-completion reconciliation. | Copying the version 4 documents verbatim would incorrectly restore removed deploy/release nodes and omit later traversal behavior. |

## Verification contract

The reconciliation is complete only when all of the following pass from the
SAC-121 worktree:

- TypeScript tests and typecheck
- Python tests and Ruff
- generated Worker binding check
- strict validation of both active OpenSpec changes and all main specs
- Wrangler dry-run for both Workers
- migration application in filename order with `PRAGMA foreign_key_check`

Fresh live deployment and provider-originated evidence are recorded separately
in `docs/evidence/sac-121-pr46-live-e2e.md`.
