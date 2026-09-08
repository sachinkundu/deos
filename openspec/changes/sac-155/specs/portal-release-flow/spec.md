## Purpose

Keep the live portal up while people test new work on a clear staging site.

## ADDED Requirements

### Requirement: Keep live and staging sites apart

The system SHALL serve two portal sites. One SHALL be live. One SHALL be staging. Staging SHALL use code from `main`. Live SHALL use code from the release branch. A change to `main` alone MUST NOT change live.

#### Scenario: New work reaches main

- **WHEN** new portal work is added to `main`
- **THEN** the work can reach staging, while live stays on its last release

#### Scenario: Work is still under review

- **WHEN** people test new work on staging
- **THEN** the live site stays open and keeps its released set of features

### Requirement: Name each site clearly

The production portal SHALL use `deos.voxdez.com`. The staging portal SHALL use `deos-staging.voxdez.com`. Each portal SHALL show a clear site name. The name SHALL state if the site is production or staging.

#### Scenario: Person opens staging

- **WHEN** a person views the staging portal
- **THEN** `deos-staging.voxdez.com` clearly says that the site is staging

#### Scenario: Person opens live

- **WHEN** a person views the live portal
- **THEN** `deos.voxdez.com` clearly says that the site is production

### Requirement: Share the same portal data

Both sites SHALL use the same D1 and R2 stores. They SHALL use the same GitHub and Linear links. The system MUST NOT copy that data for staging. This change SHALL NOT alter how those services store data. Both sites SHALL show a change to shared data. This rule holds when the sites have a different set of features.

#### Scenario: Shared data changes

- **WHEN** shared portal data changes through either site or a linked service
- **THEN** live and staging both read the new data from the shared stores

#### Scenario: Sites run different portal code

- **WHEN** staging has a feature that is not yet live
- **THEN** both sites still use the same records and stored files

### Requirement: Release reviewed work by choice

The repo SHALL define a GitHub release pipeline in code. Only that pipeline SHALL deploy production, and it SHALL deploy only from the release branch. A person MUST choose when reviewed work moves from `main` to that branch. A push to `main` MUST NOT start a production deploy. Staging MAY deploy from `main` through GitHub CI, a DEOS workflow, or a manual Wrangler deploy.

#### Scenario: Main is ready for staging

- **WHEN** a change on `main` is ready to test
- **THEN** GitHub CI, a DEOS workflow, or Wrangler can deploy it to staging and leave production as it is

#### Scenario: Person starts a release

- **WHEN** a person chooses to move reviewed staging work to the release branch
- **THEN** the GitHub release pipeline can deploy that branch to production

#### Scenario: No release is chosen

- **WHEN** `main` changes but no one moves that work to the release branch
- **THEN** production keeps the prior release

### Requirement: Keep the last live release on a failed deploy

The GitHub release pipeline SHALL keep the last good production release in place when its check or deploy fails. A failed staging check or deploy, from any allowed path, MUST NOT replace the production site.

#### Scenario: Staging deploy fails

- **WHEN** a staging check or deploy fails
- **THEN** the production site stays open on its last release

#### Scenario: Live deploy fails

- **WHEN** a deploy from the release branch fails
- **THEN** the prior production release stays open
