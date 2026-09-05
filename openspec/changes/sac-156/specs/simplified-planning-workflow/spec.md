## MODIFIED Requirements

### Requirement: Verify the approved planning work on the default branch

The simplified workflow SHALL use two proofs before it reports success. First, the trusted service SHALL prove that the approved pull request was merged and that its plan files are on the main branch. It SHALL then move the Linear issue to `Done` through a trusted Workflow action and read the issue back. The run MUST stay open until both proofs pass.

The final move SHALL start only after the human merge choice and merge proof. A retry SHALL reuse the same action. If the final move is not proved, the run SHALL save the fault and the facts needed to retry only that move. It MUST NOT repeat the review, merge, or prior agent work.

#### Scenario: Authorized pull request is merged and verified

- **WHEN** the saved pull request was approved, merged into the main branch, and its plan files match the approved work.
- **THEN** the Workflow saves the merge proof, moves the issue to `Done`, checks that state in Linear, and only then ends the run as a success.

#### Scenario: Merge response is ambiguous

- **WHEN** the merge call times out or its reply is lost.
- **THEN** the trusted service reads the saved pull request and the main branch before any retry, and it does not create or merge another pull request.

#### Scenario: Pull request cannot be merged safely

- **WHEN** the saved pull request is closed with no merge, has the wrong base or head, has a clash, or fails a merge rule.
- **THEN** the workflow saves a safe failed result, does not move the issue to `Done`, and does not claim that the plan reached the main branch.

#### Scenario: Merge succeeds but planning files cannot be verified

- **WHEN** GitHub reports a merge but the approved plan files cannot be found or matched at that main branch commit.
- **THEN** the workflow asks for repair, does not move the issue to `Done`, and does not end the run as a success.

#### Scenario: Final Linear reply is not clear

- **WHEN** the final Linear call times out or its reply is lost.
- **THEN** the Workflow reads the issue before a safe retry, keeps the run open, and does not repeat the review, merge, or agent work.

#### Scenario: Final Linear move fails

- **WHEN** Linear rejects the final move or the issue cannot be read back in `Done`.
- **THEN** the Workflow saves the fault and a recovery link, keeps the run open, and lets staff retry only the final move.
