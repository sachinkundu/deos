## ADDED Requirements

### Requirement: Save the project repository

The portal SHALL let the allowed Cloudflare Access user view and save one exact
GitHub `owner/name` repository for the configured Linear project. A save SHALL
use the shown revision, leave the simplified selector off, and read the saved
row back before success is shown. GitHub App installation access SHALL remain a
separate provider permission.

#### Scenario: Operator saves a repository

- **WHEN** the allowed user saves a valid repository with the current revision and no project run is active
- **THEN** D1 stores it, raises the revision, records the user and time, disables selectors for the prior repository, and returns the saved row

#### Scenario: A run is active

- **WHEN** the allowed user tries to change the repository while a project run is active
- **THEN** the portal rejects the change and keeps the current repository

#### Scenario: The page has an old revision

- **WHEN** the allowed user saves a revision that no longer matches D1
- **THEN** the portal rejects the stale save and returns no success

#### Scenario: GitHub App access is not granted

- **WHEN** a repository is saved in D1 but the DEOS GitHub App is not allowed to use it
- **THEN** the setting does not grant access and the operator must add the repository in GitHub before a workflow test starts

### Requirement: Resolve one repository before agent execution

For each new run, DEOS SHALL resolve the configured Linear project's exact
GitHub repository from D1 before it allocates a Sandbox attempt. It SHALL freeze
that repository in the durable job. Sandbox checkout, agent publication
instructions, and the signed GitHub capability grant SHALL use that same frozen
value. The deployment repository value MUST NOT act as runtime authority after
the D1 policy exists.

#### Scenario: Saved repository differs from the deployment seed

- **WHEN** D1 maps the project to a repository that differs from the deployment seed
- **THEN** the durable job, Sandbox checkout, agent publication request, and GitHub capability grant all use the D1 repository

#### Scenario: Repository cannot be resolved

- **WHEN** the project has no valid repository mapping in D1
- **THEN** DEOS stops before Sandbox allocation and records a bounded configuration failure

### Requirement: Open settings at a stable route

The portal SHALL open project settings at `/settings`. The workflow view SHALL
remain at `/`. Direct navigation, portal links, and browser history SHALL show
the view that matches the current path.

#### Scenario: Operator opens the settings link

- **WHEN** the allowed user opens `/settings` directly
- **THEN** the portal shows project settings without first opening the workflow view

#### Scenario: Operator uses browser history

- **WHEN** the allowed user moves between `/` and `/settings` and then uses back or forward
- **THEN** the portal restores the view that matches the browser path

#### Scenario: Operator opens an unknown path

- **WHEN** the allowed user opens a portal path that is not registered
- **THEN** the portal shows that the page was not found and does not silently show another view

### Requirement: Show each setting once

The settings page SHALL show editable repository and workflow controls only in
their main cards. A supporting details card SHALL not repeat those values. It
MAY show active-run count, save history, editor identity, and provider access
links that are not shown in the main cards.

#### Scenario: Operator reviews project settings

- **WHEN** the settings page has loaded
- **THEN** the right-hand details card omits the repository, workflow dispatch state, and simple workflow state

### Requirement: Save guarded workflow controls

The portal SHALL let the allowed user view and save workflow dispatch and the
simple workflow selector as one D1 settings change. A save SHALL use the shown
workflow revision and SHALL read both values back before success is shown. The
portal MUST reject a save while any project run is active.

#### Scenario: Operator saves workflow controls

- **WHEN** the allowed user saves both controls with the current workflow revision and no project run is active
- **THEN** D1 stores both values, raises the workflow revision, records the user and time, and returns the saved values

#### Scenario: A run starts before the control save

- **WHEN** a project run becomes active before the control change is stored
- **THEN** the portal rejects the whole change and keeps both controls unchanged

#### Scenario: Workflow controls have an old revision

- **WHEN** the allowed user saves a workflow revision that no longer matches D1
- **THEN** the portal rejects the stale save and returns no success

#### Scenario: Repository changes

- **WHEN** the allowed user saves another repository
- **THEN** workflow dispatch and every simple selector for the project are turned off before success is shown
