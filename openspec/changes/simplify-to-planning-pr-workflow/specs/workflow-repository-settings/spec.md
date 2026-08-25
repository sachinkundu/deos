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
