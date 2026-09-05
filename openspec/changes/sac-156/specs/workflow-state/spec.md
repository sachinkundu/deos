## ADDED Requirements

### Requirement: Close successful work in Linear

The Workflow SHALL own one final Linear state move for each run. It SHALL move the issue to `Done` only after every success gate for the saved workflow has passed, including the human review and merge choice. This move MUST NOT replace or bypass either choice. An agent result, note, or file MUST NOT start this move.

The final action SHALL use one stable key for the run and its last node. It SHALL read the issue after each call and save the call result. A run MUST NOT end as a success until the read shows `Done`.

#### Scenario: Run is ready to close

- **WHEN** every work step and human gate on the success path has passed.
- **THEN** the Workflow uses its final action to move the issue to `Done`, reads back that state, saves the result, and ends the run as a success.

#### Scenario: Final action is played again

- **WHEN** the same final action runs again after its call may have worked.
- **THEN** the Workflow reuses the stable key, treats an issue already in `Done` as a match, and creates no second logical move.

#### Scenario: A close request comes too soon

- **WHEN** an agent asks for `Done` or any work step, review gate, merge choice, or success proof is not complete.
- **THEN** the Workflow does not run the final action and does not end the run as a success.

#### Scenario: Final action needs repair

- **WHEN** the final call fails, stays unclear after a read, or cannot prove `Done`.
- **THEN** the Workflow saves the safe fault and retry state, keeps the run out of terminal success, and does not repeat work that had passed.

#### Scenario: Current issue state conflicts with the final move

- **WHEN** the issue is not in `Done` and its current state does not match the saved source state for the final action.
- **THEN** the Workflow records the clash, does not replace the newer state, and leaves the final action open for staff to fix.

#### Scenario: Staff retry the final action

- **WHEN** staff retry a saved final action after its fault is fixed.
- **THEN** the Workflow reuses the same action and prior success facts, retries only the move to `Done`, and ends the run only after a good read.
