# Native OpenSpec Sandbox Canary

Date: 2026-08-17

## Scope

SAC-110 exercised workflow definition version 8 against the controlled
`sachinkundu/deos` test repository. The canary requested a dependency-free
calculator CLI and required native OpenSpec progression through proposal,
specification, design, tasks, implementation, review, and verification. The
calculator was not deployed.

## Provider-originated run

- Linear issue: `SAC-110`
- Linear issue UUID: `2fd18891-2272-453e-a3cc-174a236e28f9`
- Workflow run:
  `workflow:99426d9b-cda7-4db4-9136-692a95a0b090:2fd18891-2272-453e-a3cc-174a236e28f9:run:1`
- Definition: `openspec-delivery` version 8
- Definition digest:
  `dbe4bf87f2f611ac6af9ed1b9575fd725609599f245a4be6da564ace7e3a32f0`

The run was created from authenticated Linear deliveries. Requirements and
architecture approval each paused in the `Human Review` Linear state and
continued only after a human moved the issue to `In Progress`.

## Durable progression

The following D1 attempts completed and their Sandboxes were destroyed:

| Node | Attempt | Result |
| --- | --- | --- |
| `requirements` | `01a00fa0-f08d-7668-91e1-ff6d4b24c84f` | completed |
| `requirements_review` | `01a00fa5-ebd1-767c-a532-da3c91c1145c` | approved |
| `openspec_proposal` | `01a00fab-921b-7dac-9d51-e2e89047e4b6` | completed |
| `openspec_specs` | `01a00fb0-9a62-77ca-a716-f1c3ebd824e4` | completed |
| `bdd_review` | `01a00fb5-df7d-7e1d-a214-c20664712166` | approved |
| `ddd_architecture` | `01a00fba-f820-727a-8b62-405331fab1e7` | completed |
| `ddd_review` | `01a00fc0-408a-76ad-b0c0-3c0b0814dfbc` | approved |
| `openspec_tasks` | `01a00fc6-0cd4-7806-8faa-94d775372201` | completed |
| `implementation` | `01a00fcb-110e-7eef-8ebc-fe71c82f4fea` | completed |
| `code_review` | `01a00fd4-c102-7e7e-a06a-2398b223d22e` | approved |
| `evidence_verification` | `01a00fda-126e-71ca-b4c1-944649596825` | changes requested |
| `implementation` | `01a00fdf-1454-74e1-ac25-59bc31db2c2a` | completed |
| `code_review` | `01a00fe1-ce4b-7d81-8841-5cf1e5f2fbef` | approved |
| `evidence_verification` | `01a00fe6-d48d-76cb-bcc7-cd4b10da01cc` | certified |
| `openspec_verify` | `01a00fec-3e22-77dd-915c-a88dede19a0e` | completed |

Each native OpenSpec attempt stored the trusted change identity `sac-110`, the
allowlisted instruction, and the SHA-256-addressed cumulative patch selected
from the preceding complete manifest. Proposal, specs, design, and tasks each
reported strict OpenSpec validation before the next job was dispatched.

## Implementation artifact proof

The implementation manifest was complete and referenced an R2 `patch.diff`
with these durable properties:

- SHA-256:
  `02ee9f79815b23f7a0dd6758a44de52190014dafe05f7b32f7d7fcc51864b2d1`
- Size: 21,840 bytes
- Base commit used for independent reproduction: `8660c27`

The downloaded R2 bytes matched D1, applied cleanly to a detached clean
worktree, and produced the requested `src/deos/calculator.py`, subprocess tests,
and completed `sac-110` task checklist. Independent validation of that applied
artifact produced:

- 20 passing pytest tests
- Ruff passing
- strict `openspec validate sac-110` passing
- `add 2 3` printing `5.0` with exit status 0
- `divide 1 0` producing no stdout, a division-by-zero stderr message, and exit
  status 1

## Canary findings

Earlier canary attempts exposed three workflow defects:

1. Agent-declared provider receipts must contain the exact successful
   capability `operationId`, and ordinary non-OpenSpec agents must publish an
   auditable provider work product or Linear working note.
2. A plain working-tree diff omits untracked OpenSpec artifacts. Patch capture
   now uses an isolated temporary Git index so added, modified, and deleted
   files all survive cumulative continuation without changing the real index.
3. The pre-release evidence prompt allowed the reviewer to require downstream
   native verify, release, sync, and archive outputs before it would certify
   entry to native verify. Definition version 9 scopes that reviewer to the
   current implementation phase and keeps service-owned D1/R2 integrity,
   cleanup, and receipt enforcement in the trusted controller.

Trial dispatch was disabled after SAC-110 reached post-implementation evidence
verification. The active run can finish its existing verification path, but a
new project delivery cannot start another trial run. Definition version 9 was
deployed and registered with digest
`7b8c872007337f0b6b034746359da0cfe4ce6d5a9cfddfd6842112bf1f39f5ca`
while dispatch remained disabled. SAC-110 correctly retained its immutable
version 8 definition. Native verification then completed, its Sandbox was
destroyed, and the run stopped at `release_approval` with D1
`status=awaiting_human` and Linear in `Human Review`. The release gate was not
approved, so no calculator deployment or downstream archive occurred.
