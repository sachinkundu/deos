## Purpose

Keep workflow visualization and project controls at distinct, predictable destinations in the authenticated DEOS operator portal.

## ADDED Requirements

### Requirement: Portal paths have one explicit product destination
The Access-protected portal SHALL serve the workflow visualization at `/`, the project settings interface at `/settings` and `/settings/`, and a safe not-found response for unsupported browser paths. Static-asset fallback MUST NOT cause the workflow visualization to replace the settings interface. Both product destinations SHALL use the same authenticated portal boundary.

#### Scenario: Operator opens the subdomain root
- **WHEN** the authorized operator opens `/`
- **THEN** the portal displays the workflow visualization

#### Scenario: Operator opens settings
- **WHEN** the authorized operator opens `/settings` or `/settings/`
- **THEN** the portal displays the project settings interface with the current durable values

#### Scenario: Operator opens an unsupported path
- **WHEN** the authorized operator opens a browser path other than the declared portal destinations
- **THEN** the portal returns a safe not-found view and does not substitute the workflow visualization

#### Scenario: Caller is not authorized
- **WHEN** a caller requests either product destination without valid Access identity
- **THEN** the portal denies the request before returning application assets or durable project data

### Requirement: Settings expose only controls that affect new default runs
The settings interface SHALL expose the configured repository and one workflow dispatch control for new start events. It SHALL NOT expose a simple-workflow label selector because the simple workflow is the default. Repository and dispatch changes SHALL keep their existing active-run lock, revision check, durable write, and read-back confirmation.

#### Scenario: Operator views workflow controls
- **WHEN** settings load successfully
- **THEN** the page shows the dispatch control and does not show a simple-workflow selector control

#### Scenario: Operator changes dispatch
- **WHEN** the authorized operator saves a dispatch change while no run is active and the revision matches
- **THEN** the portal writes the new durable value, reads it back, and shows the confirmed result

#### Scenario: A run is active
- **WHEN** the operator opens settings while a workflow run is active
- **THEN** repository and dispatch mutations remain locked until that run is terminal
