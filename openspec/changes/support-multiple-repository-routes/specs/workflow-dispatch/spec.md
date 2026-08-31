## MODIFIED Requirements

### Requirement: Preserve the saved repository

Deploy values SHALL seed only a missing first route. Setup MUST NOT replace a
route saved by a user. Setup SHALL attach the current workflow set to every
saved route. It SHALL keep each route's repo, App install, controls, edits, and
active runs.

#### Scenario: Setup runs after a repository change

- **WHEN** setup runs after a user changed a D1 route
- **THEN** it keeps the saved route and does not restore the deploy seed

#### Scenario: Setup sees several routes

- **WHEN** D1 has more than one repo route
- **THEN** setup adds the current workflow set to each route and changes no route settings

#### Scenario: Setup adds a new definition version

- **WHEN** the deploy has a new fixed workflow version
- **THEN** setup makes it ready for each route and keeps each route's saved state

## ADDED Requirements

### Requirement: Select one repository route for each new run

Dispatch SHALL find one enabled route from the event's Linear project. It
SHALL do so before it makes a run. It SHALL copy the route id, route version,
repo, App install, workflow, and review settings into the run. Later events
SHALL use that fixed copy. A route edit MUST NOT move an active run.

#### Scenario: Start event matches one enabled route

- **WHEN** dispatch gets a start event with a current enabled route
- **THEN** it makes a run with that route's repo, App install, workflow, and review settings

#### Scenario: Route changed before Queue consumption

- **WHEN** queued route proof no longer matches D1
- **THEN** dispatch saves a safe stale-route result and makes no run

#### Scenario: Route changes after run allocation

- **WHEN** a user edits a route after a run starts
- **THEN** later events and GitHub work keep using the run's fixed route

#### Scenario: GitHub access was revoked before allocation

- **WHEN** the App can no longer use the saved repo with the needed rights
- **THEN** dispatch saves a safe access result, marks the route unready, and makes no run or Sandbox

#### Scenario: Two routes start work

- **WHEN** start events arrive for two enabled routes
- **THEN** dispatch can make one run for each route and neither route blocks the other

#### Scenario: No enabled route exists

- **WHEN** dispatch cannot find one enabled route for the event
- **THEN** it saves the safe route result and starts no agent or provider work
