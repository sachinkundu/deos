## MODIFIED Requirements

### Requirement: Authorize provider operations by capability and target

The system SHALL check each agent request against a named right, action, route,
run, and attempt. GitHub work SHALL use only the repo and App install saved on
the run. Linear work SHALL stay inside the saved workspace, project, and issue.
Agents MUST NOT change Linear state.

#### Scenario: Allowed GitHub operation is requested

- **WHEN** an agent asks for allowed GitHub work on its saved repo and App install
- **THEN** the system does the work with those rights and saves the check result

#### Scenario: Allowed Linear operation is requested

- **WHEN** an agent asks for an allowed non-state Linear update in its saved scope
- **THEN** the system does the update without giving the agent state-change rights

#### Scenario: Linear transition is requested by an agent

- **WHEN** an agent asks to create, approve, reject, or make any Linear state change
- **THEN** the system denies the request, saves the breach, and leaves the choice to the Workflow

#### Scenario: Target is outside the trial scope

- **WHEN** an agent asks for work outside its saved route or named right
- **THEN** the system denies it before any provider call and saves a safe result

#### Scenario: Route changes during an attempt

- **WHEN** a user edits the route during an agent attempt
- **THEN** the check keeps using the attempt's fixed target and ignores the new setting

## ADDED Requirements

### Requirement: Report GitHub App access for route settings

Trusted provider code SHALL list the App installs and repos that DEOS can use.
It SHALL show the install settings link and needed repo rights. It MUST keep the
App key, App JWT, install token, auth headers, and raw replies away from the
portal and browser.

#### Scenario: Repository is accessible

- **WHEN** an App install can use a repo with the needed rights
- **THEN** the provider code returns safe repo, install, access, rights, and settings-link fields

#### Scenario: Repository is outside the installation

- **WHEN** a saved repo is not in the live list for its App install
- **THEN** provider code reports missing access and does not make broader keys or change GitHub

#### Scenario: Operator must grant access

- **WHEN** Settings shows missing or weak App access
- **THEN** the portal links the user to that install and checks again before enablement

#### Scenario: Provider response is invalid

- **WHEN** GitHub fails or sends bad install or repo data
- **THEN** provider code returns a safe unavailable state and shows no secret or raw reply
