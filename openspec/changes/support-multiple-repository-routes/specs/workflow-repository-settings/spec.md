## MODIFIED Requirements

### Requirement: Save the project repository

The portal SHALL let the allowed Access user see and save any number of repo
routes. Each route SHALL link one Linear project to one exact GitHub
`owner/name` repo and one App install. A save SHALL use the route's shown edit
number. The portal SHALL read the saved row back before it shows success. A new
or changed route SHALL stay off until a live App access check passes.

#### Scenario: Operator saves a repository

- **WHEN** the user saves a new Linear project and an App-accessible repo
- **THEN** D1 makes the route, saves its App install, user, time, and edit number, and returns the row

#### Scenario: Operator changes one repository route

- **WHEN** the user saves another accessible repo and that route has no active work
- **THEN** D1 updates and turns off that route, raises its edit number, and changes no other route

#### Scenario: A run is active

- **WHEN** the user tries to change a route that has active work
- **THEN** the portal rejects the save and keeps that route unchanged

#### Scenario: Another route has active work

- **WHEN** the user changes one route while only another route has active work
- **THEN** the portal saves the edit and does not pause or change the active route

#### Scenario: The page has an old revision

- **WHEN** the shown edit number no longer matches that D1 route
- **THEN** the portal rejects the stale save and shows no success

#### Scenario: GitHub App access is not granted

- **WHEN** the user picks a repo that the DEOS App cannot use
- **THEN** the portal shows missing access, keeps the route off, and links to that App install

### Requirement: Resolve one repository before agent execution

DEOS SHALL find the route for the issue's Linear project before it makes a
Sandbox attempt. It SHALL copy the route version, repo, App install, and
workflow settings into the run. Checkout, plan work, and signed GitHub rights
SHALL use that same fixed copy. Deploy values MUST NOT replace a D1 route.

#### Scenario: Saved repository differs from the deployment seed

- **WHEN** D1 maps the project to a repo that differs from the deploy seed
- **THEN** the run, checkout, plan work, and GitHub rights all use the D1 route

#### Scenario: Repository cannot be resolved

- **WHEN** the issue's project has no valid enabled route in D1
- **THEN** DEOS stops before Sandbox work and saves a safe setup result

#### Scenario: Route changes after allocation

- **WHEN** a user edits another route after a run starts
- **THEN** the run keeps its fixed repo, App install, and workflow settings

### Requirement: Show each setting once

The Settings page SHALL list every repo route. It SHALL show the chosen route's
editable values in the main cards. Other detail cards SHALL not repeat those
values. They MAY show the active-run count, save history, user, and App links.

#### Scenario: Operator reviews project settings

- **WHEN** the Settings page loads
- **THEN** it lists each route's Linear project, repo, workflow state, App access, and active-run count

#### Scenario: Operator opens one route

- **WHEN** the user picks a route
- **THEN** its repo and controls appear once and all other route values stay unchanged

### Requirement: Save guarded workflow controls

The portal SHALL save workflow dispatch for each route on its own. A save SHALL
use the shown workflow edit number. It SHALL read the value back before success.
The portal MUST reject a save while that route has active work. The portal MUST
check current App access and needed repo rights before it turns a route on.

#### Scenario: Operator saves workflow controls

- **WHEN** the user saves a current control for an idle route with valid App access
- **THEN** D1 saves it, raises that route's workflow edit number, records the user and time, and changes no other route

#### Scenario: A run starts before the control save

- **WHEN** work on that route starts before the save reaches D1
- **THEN** the portal rejects the save and keeps that route's control

#### Scenario: Active work exists only on another route

- **WHEN** the user changes one route while another route has active work
- **THEN** the portal saves the change and does not pause or edit the active route

#### Scenario: Workflow controls have an old revision

- **WHEN** the shown workflow edit number no longer matches D1
- **THEN** the portal rejects the stale save and shows no success

#### Scenario: Provider access was removed

- **WHEN** the user tries to turn on a route after App access was removed
- **THEN** the portal rejects the save, shows missing access, and keeps the route off

#### Scenario: Repository changes

- **WHEN** the user saves another repo for a route
- **THEN** that route turns off before success and every other route keeps its controls

## ADDED Requirements

### Requirement: Discover route choices and GitHub access

Settings SHALL load safe, live lists of Linear projects, App installs, and
repos. Provider keys and tokens MUST stay in the trusted Worker. The browser
SHALL get only the ids, names, access state, rights, and links needed for a
route.

#### Scenario: Provider catalogs load

- **WHEN** the user opens route settings and both providers reply
- **THEN** the page shows visible Linear projects and repos grouped by App install

#### Scenario: GitHub access needs a change

- **WHEN** a saved repo is missing from its App install or lacks a needed right
- **THEN** the page marks the route unready and links to that install's GitHub settings

#### Scenario: A provider catalog is unavailable

- **WHEN** Linear or GitHub cannot return a valid list
- **THEN** the page keeps saved routes visible, names the failed check, and enables no unverified route

### Requirement: Save review settings per route

The portal SHALL save each route's review model with its own edit number and
active-work guard. A new run SHALL copy that model from its route. An edit to
one route MUST NOT change another route or an active run.

#### Scenario: Operator changes one review model

- **WHEN** the user saves a supported model for an idle route with its current edit number
- **THEN** D1 saves and reads back that model and changes no other route

#### Scenario: Route has active work

- **WHEN** the user tries to change the review model for a route with active work
- **THEN** the portal rejects the save and keeps that route's model
