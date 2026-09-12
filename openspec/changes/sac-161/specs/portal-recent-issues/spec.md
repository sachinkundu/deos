## Purpose

Keep a private list of recent issue searches so each person can return to prior workflow views with less effort.

## ADDED Requirements

### Requirement: Successful searches update recent issues

The portal SHALL save an issue when a search finds that exact issue and it has a workflow view. It SHALL keep one saved entry for each issue. A new search for the same issue SHALL move that entry to the top. A search with no exact issue or no workflow view SHALL NOT change the saved list.

#### Scenario: Person searches for a new issue

- **WHEN** a person searches for an exact issue that has a workflow view.
- **THEN** the portal adds the issue to the top of that person's saved list.

#### Scenario: Person searches for the same issue again

- **WHEN** a saved issue is searched for again.
- **THEN** the portal moves it to the top and keeps only one entry for it.

#### Scenario: Search cannot find a workflow view

- **WHEN** a search has no exact issue or the issue has no workflow view.
- **THEN** the portal leaves the saved list as it was.

### Requirement: Each person keeps at most ten distinct issues

The portal SHALL keep no more than ten saved issues for each signed-in person. It SHALL order them by the latest successful search, with the newest first. When a new distinct search raises the count above ten, the portal SHALL remove the least recent entry for that person.

#### Scenario: Person has fewer than ten saved issues

- **WHEN** a person searches for a new distinct issue and has fewer than ten saved issues.
- **THEN** the portal adds the issue first and keeps all older entries in their prior order.

#### Scenario: Eleventh distinct issue is searched

- **WHEN** a person with ten saved issues searches for a new distinct issue.
- **THEN** the portal puts the new issue first and removes the least recent issue.

### Requirement: Saved issues are private and durable

The portal SHALL bind each saved list to the trusted identity of the signed-in person. It SHALL load the same list after a page reload or a later sign-in. It MUST NOT return one person's saved entries to another person.

#### Scenario: Person reloads the page

- **WHEN** a signed-in person reloads the workflow portal.
- **THEN** the sidebar shows that person's saved issues in the same most-recent-first order.

#### Scenario: Person returns later

- **WHEN** the same person signs in again after the browser session ends.
- **THEN** the portal loads that person's saved list without the person searching again.

#### Scenario: Another person signs in

- **WHEN** a different trusted identity opens the portal.
- **THEN** the portal shows only the saved list bound to that identity.

### Requirement: Saved issues open from the sidebar

The workflow sidebar SHALL show up to ten saved issues. Choosing an entry SHALL open that issue's workflow view under the existing run selection rules. Showing or opening a saved issue SHALL NOT change the issue state or workflow state.

#### Scenario: Person opens a saved issue

- **WHEN** a person chooses a saved issue in the sidebar.
- **THEN** the portal opens its workflow view and keeps the issue and workflow states unchanged.

#### Scenario: Saved issue has more than one run

- **WHEN** a person chooses a saved issue that has more than one workflow run.
- **THEN** the portal opens it with the run chosen by the portal's existing run selection rules.

### Requirement: The feature reaches staging before production

The feature MUST be deployed to the DEOS portal staging site and checked there before the same source revision can be released to production. A failed or missing staging check MUST block the production release of this feature.

#### Scenario: Staging check passes

- **WHEN** the feature source revision is active on staging and its checks pass.
- **THEN** that same revision is eligible for the normal production release process.

#### Scenario: Staging check is missing or fails

- **WHEN** the feature has no passing staging check for its source revision.
- **THEN** the feature does not reach production and the current production release stays in place.
