## MODIFIED Requirements

### Requirement: Produce one proposal-and-specification pull request

The simple flow SHALL start one plan author attempt. The author SHALL make or revise the named OpenSpec change. It SHALL write the proposal and all needed delta specs in order. It SHALL check those files. The plan SHALL stay private while the author runs the needed self-check loop in the same Sandbox. After an allowed stop, a trusted step SHALL post the checked plan and needed change data to one GitHub pull request.

Each file in the post request SHALL use its full repo path. Review order text SHALL use paths from the change folder. The plan author MUST NOT make a design or task list. It MUST NOT change app code or Linear state. It MUST NOT approve, post, or merge the pull request. It MUST NOT use provider access.

#### Scenario: First planning attempt completes

- **WHEN** the plan author makes a valid proposal and all needed delta specs.
- **THEN** the plan stays private and the live author starts the self-check loop in the same Sandbox.

#### Scenario: Planning self-check reaches an allowed stop

- **WHEN** the private plan gets a pass, limit, or judgment result allowed by the set rules.
- **THEN** the trusted step posts only the checked plan files and needed change data to one run branch and pull request and saves the provider receipt.

#### Scenario: Planning artifacts are incomplete or invalid

- **WHEN** the proposal, a needed delta spec, check result, self-check result, or post receipt is missing or bad.
- **THEN** the flow does not enter `Human Review` or report success.

#### Scenario: Publication uses a short file path

- **WHEN** a plan post file leaves out the full change path.
- **THEN** the trusted post step rejects it and the flow does not count the plan as done.

#### Scenario: Planning agent attempts a deferred action

- **WHEN** the plan author asks for a design, task list, app change, Linear move, pull request post or merge, or other provider task.
- **THEN** the request is denied and the flow does not count the plan as done.
