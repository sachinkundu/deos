## MODIFIED Requirements

### Requirement: Authenticate and classify deliveries

Ingress SHALL check the raw request. It SHALL reject a bad or old signature.
It SHALL mark each valid event as relevant, irrelevant, or duplicate. A start
event SHALL need an enabled D1 route for its Linear project. Ingress SHALL read
label proof from the signed Linear body. It SHALL add that proof and the route
id to the queued event. Later code MUST NOT read current labels to pick a flow.

#### Scenario: Invalid delivery

- **WHEN** a request has a bad signature or an old time
- **THEN** ingress rejects it and adds no Queue work

#### Scenario: Relevant delivery

- **WHEN** a valid event matches an enabled route and its start state
- **THEN** ingress saves and queues the delivery, issue, project, route, state change, actor, time, and label proof

#### Scenario: Configured route is disabled

- **WHEN** a valid event belongs to a saved route that is off
- **THEN** ingress saves and accepts it as irrelevant and adds no Queue work

#### Scenario: Linear project has no route

- **WHEN** a valid event belongs to a Linear project with no D1 route
- **THEN** ingress saves and accepts it as irrelevant and adds no Queue work

#### Scenario: Another route is active

- **WHEN** a valid start event belongs to one route while another route has work
- **THEN** ingress admits the new event and does not wait for the other route

#### Scenario: Provider payload translation

- **WHEN** ingress reads a Linear webhook body
- **THEN** the queued event hides provider fields but keeps the route and safe label proof

#### Scenario: Provider payload lacks usable label evidence

- **WHEN** a valid start event has no usable label proof
- **THEN** ingress queues an explicit unknown value so later code fails safe and does not read current labels
