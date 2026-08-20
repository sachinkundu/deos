## Purpose

Provide one private, live, issue-centred view of the D1-authoritative DEOS business workflow without exposing execution-only data or creating another workflow authority.

## ADDED Requirements

### Requirement: The portal is restricted to the named operator
The deployed portal and every portal-owned API or artifact route SHALL be protected by Cloudflare Access. Access SHALL authenticate through Google, SHALL allow only the identity whose verified email is exactly `sachinkundu@gmail.com`, and SHALL deny every other identity by default. The portal backend SHALL also reject any request for which the trusted Access identity is absent or does not contain that exact email.

#### Scenario: Named operator signs in with Google
- **WHEN** Google authenticates the request as `sachinkundu@gmail.com` and the request satisfies the portal's Access policy
- **THEN** the operator can load the portal and call its authenticated read routes

#### Scenario: Another Google identity signs in
- **WHEN** Google authenticates the request with any email other than `sachinkundu@gmail.com`
- **THEN** Access denies the request before any workflow projection or artifact content is returned

#### Scenario: Trusted Access identity is absent
- **WHEN** a request reaches the portal backend without a trusted Cloudflare Access identity
- **THEN** the backend denies the request and returns no workflow, issue, run, or artifact data

### Requirement: The portal has a read-only resource boundary
The portal SHALL use only the minimum resource access needed to read the operator view. Its D1 operations SHALL be read-only statements, its R2 operations SHALL be limited to metadata and object reads, and any Linear credential or integration used for issue lookup SHALL be read-scoped. The portal SHALL have no Queue producer or consumer, Workflow, Sandbox, workflow-mutation, or provider-capability binding or credential. It SHALL expose no route that changes DEOS, Linear, GitHub, D1, or R2 state, and SHALL send no resource binding, credential, or secret to the browser.

#### Scenario: Deployment resource inventory is inspected
- **WHEN** the deployed portal's bindings, variables, secrets, and provider credentials are enumerated
- **THEN** the inventory contains only the resources needed for authenticated D1 reads, approved R2 reads, and read-only Linear lookup and contains no workflow or provider-mutation capability

#### Scenario: Portal reads durable workflow data
- **WHEN** the portal resolves an issue and projects a run
- **THEN** every database statement used by that request is read-only and the request causes no durable state change

#### Scenario: Portal reads an approved artifact
- **WHEN** the operator opens an artifact or transcript destination
- **THEN** the portal performs only metadata or object reads and does not create, replace, or delete any object

#### Scenario: A caller attempts mutation
- **WHEN** a caller sends a non-read method or requests a mutation through any portal route
- **THEN** the portal rejects the request and no DEOS or provider state changes

### Requirement: An issue key resolves the available DEOS runs
The portal SHALL accept a human Linear issue key without requiring a project UUID, issue UUID, correlation identifier, run identifier, or executor identifier. It SHALL show the issue's available DEOS run sequences newest first, select the latest sequence by default, and allow the operator to select another available sequence explicitly.

#### Scenario: Issue has one run
- **WHEN** the operator submits a valid Linear issue key with one recorded DEOS run
- **THEN** the portal selects that run and shows its workflow view

#### Scenario: Issue has several runs
- **WHEN** the operator submits a valid Linear issue key with several recorded DEOS runs and does not request a sequence
- **THEN** the portal selects the highest run sequence and offers the other sequences newest first

#### Scenario: Operator selects an older run
- **WHEN** the operator selects an available earlier run sequence
- **THEN** the portal replaces the displayed workflow with the projection and history for exactly that sequence

#### Scenario: Issue has no DEOS run
- **WHEN** the issue key resolves but D1 has no run for that issue
- **THEN** the portal states that no DEOS workflow run is recorded and does not invent an idle or pending workflow

#### Scenario: Issue key or run sequence is invalid
- **WHEN** the submitted key is malformed, cannot be resolved, or names an unavailable run sequence
- **THEN** the portal returns a safe not-found or validation state without exposing internal identifiers, queries, or provider diagnostics

### Requirement: D1 is the sole workflow-status authority
For the selected run, the portal SHALL derive the current visit, business status, outcome, wait, and ordered history only from durable DEOS records in D1. It SHALL NOT query, infer, or display Cloudflare Workflow executor status. The view SHALL distinguish changing, active, waiting, finished, failed, canceled, denied, and unavailable outcomes without converting Linear issue status into DEOS workflow status.

#### Scenario: Run is being admitted or advanced
- **WHEN** D1 records the selected run as `pending_dispatch`
- **THEN** the portal presents the run as changing and does not claim that agent work has started

#### Scenario: Run is active
- **WHEN** D1 records the selected run as `active`
- **THEN** the portal marks the current D1 visit as active and identifies it as the last confirmed workflow position

#### Scenario: Run is waiting for the user
- **WHEN** D1 records the selected run as `awaiting_human`
- **THEN** the portal presents `Waiting for your approval`, identifies the exact current visit, and links the required action to the Linear issue

#### Scenario: Run is waiting for bounded operator action
- **WHEN** D1 records the selected run as `awaiting_capability` or `manual_reconciliation_required`
- **THEN** the portal presents a provider-neutral waiting state and only safe, bounded operator guidance recorded for that wait

#### Scenario: Run succeeded
- **WHEN** D1 records the selected run as `succeeded`
- **THEN** the portal presents the workflow as finished successfully at its terminal visit

#### Scenario: Run reached another terminal outcome
- **WHEN** D1 records the selected run as `blocked`, `failed`, `canceled`, or `denied`
- **THEN** the portal presents the exact DEOS outcome as terminal and does not label it successful

#### Scenario: Linear and DEOS disagree
- **WHEN** the Linear issue status differs from the selected run's D1 business status
- **THEN** the portal keeps the D1 status as the workflow answer and treats Linear only as linked issue context

### Requirement: The visible graph comes from the run's frozen definition
The portal SHALL load the immutable workflow definition version and digest selected when the run started and SHALL derive the visible node-and-edge structure from that matching snapshot. It SHALL show the stored version and digest as provenance for the complete frozen definition while making clear that the concise safe projection is not itself the document identified by that digest. It SHALL never return the full canonical definition document to the browser.

#### Scenario: Historical run uses an older definition
- **WHEN** the selected run references a definition version older than the currently deployed definition
- **THEN** the portal renders the selected run's frozen node-and-edge structure and shows that older version and digest

#### Scenario: Frozen definition snapshot matches
- **WHEN** the stored definition snapshot matches the selected run's definition identity, version, and digest
- **THEN** the portal projects its safe structural graph and labels the displayed digest as provenance for the complete frozen definition

#### Scenario: Frozen definition snapshot cannot be trusted
- **WHEN** the matching snapshot is absent or its identity, version, or digest does not match the selected run
- **THEN** the portal marks the graph unavailable and does not substitute the current definition or a guessed graph

#### Scenario: Client inspects the definition response
- **WHEN** the browser receives the projected definition
- **THEN** it contains only allowlisted structural node, edge, grouping, display, version, and digest fields and contains no canonical definition document, job specification, prompt, execution setting, matcher, provider configuration, or failure action

### Requirement: The workflow map presents cycles without losing structure
The portal SHALL present the full safe graph as the approved concise two-row workflow map. Related work SHALL be grouped into understandable product stages, explicit return edges SHALL remain visible, and the display SHALL NOT imply that a cyclic workflow is a one-way topological sequence. Every safely projectable frozen node SHALL contribute to a visible stage or terminal outcome; the portal SHALL report an unavailable projection rather than silently dropping an unknown node.

#### Scenario: Frozen graph contains review loops
- **WHEN** the frozen definition contains an edge that returns to earlier work
- **THEN** the concise map shows that return path and keeps the ordinary forward route readable across its two rows

#### Scenario: Stage has repeated visits
- **WHEN** one or more nodes grouped into a stage are visited more than once
- **THEN** the stage shows the exact cycle count derived from the ordered visits

#### Scenario: Current visit belongs to a grouped stage
- **WHEN** the selected run is non-terminal and its current visit belongs to a grouped stage
- **THEN** that stage is the single active or waiting stage and its detail identifies the exact current visit

#### Scenario: Definition contains an unprojectable node
- **WHEN** a frozen node cannot be mapped into the safe product-stage projection
- **THEN** the portal marks the projection unavailable and does not omit the node or replace the run's graph with another version

### Requirement: Detailed history preserves every visit and agent run
The portal SHALL retain the complete D1 ordering of workflow visits for the selected run, including repeated visits to the same node. Stage details SHALL show the visits and agent attempts that contributed to each displayed cycle in chronological order. Each agent attempt SHALL remain a distinct row with its safe agent label, cycle or visit context, confirmed outcome, timestamps, and authenticated transcript destination when an approved transcript projection exists.

#### Scenario: A review sends work backward
- **WHEN** a transition returns from review to an earlier node
- **THEN** the history retains both traversals as separate ordered visits and the affected stage's cycle count increases accordingly

#### Scenario: Several agents run in one cycle
- **WHEN** two agents each run during the same displayed cycle
- **THEN** the stage detail shows two distinct agent rows associated with that cycle

#### Scenario: An agent is retried
- **WHEN** more than one attempt is recorded for the same agent work in one visit
- **THEN** every attempt appears separately in chronological order with its own confirmed outcome

#### Scenario: Attempt has no approved transcript projection
- **WHEN** an agent attempt is recorded but no safe transcript projection is available
- **THEN** the attempt remains visible and its transcript destination is explicitly unavailable rather than linked to a raw object

### Requirement: Stage details expose useful governed work links
Stage details SHALL expose the most useful safe work products for the selected run. Planning stages SHALL link their generated OpenSpec artifacts. Implementation and validation stages SHALL use the governed pull request as their primary evidence destination rather than enumerating the implementation's source files. Human waits SHALL link to the Linear issue, and all links SHALL belong to the selected run or issue.

#### Scenario: Operator inspects a planning stage
- **WHEN** approved proposal, specification, design, or task artifacts are recorded for that stage
- **THEN** the detail lists each artifact by safe display name and opens it through an authenticated destination

#### Scenario: Operator inspects implementation or validation
- **WHEN** a governed pull request is recorded for the selected run
- **THEN** implementation and validation details show that pull request and its confirmed state as the primary evidence destination without listing every changed source file

#### Scenario: Operator inspects a human gate
- **WHEN** the selected visit requires human action
- **THEN** the detail explains the required approval or rejection and provides the selected issue's Linear destination

#### Scenario: Work product belongs to another run
- **WHEN** a requested artifact, transcript, pull request, or issue destination is not durably associated with the selected run or issue
- **THEN** the portal denies that destination instead of returning or linking it

### Requirement: Every response uses an explicit safe-field allowlist
The portal SHALL construct issue, run, graph, history, wait, attempt, and work-product responses from explicit safe-field allowlists. It SHALL exclude credentials, secrets, full definition documents, prompts, provider payloads, raw matcher or diagnostic content, unrestricted artifact bodies, raw R2 keys, and Cloudflare execution status or identifiers. An access-controlled transcript projection SHALL include only approved human-readable agent output and safe timing or outcome metadata; it SHALL exclude system or developer prompts, hidden context, unsafe tool arguments or results, and credential-like content.

#### Scenario: Safe run projection is returned
- **WHEN** an authorized operator requests a selected run
- **THEN** the response contains only the issue context, run sequence, DEOS status and outcome, current visit, safe frozen graph, ordered visit history, safe waits, safe agent attempts, approved work-product destinations, and observation timestamps required by the view

#### Scenario: Stored source row has additional columns
- **WHEN** a queried D1 row contains a field that is not present in the response allowlist
- **THEN** that field is omitted even if the browser did not explicitly request its removal

#### Scenario: Transcript contains excluded material
- **WHEN** a transcript includes a prompt, hidden context, unsafe tool content, or credential-like text
- **THEN** the excluded material is not returned and the portal does not fall back to serving the raw transcript object

#### Scenario: API or rendering fails
- **WHEN** an internal read, projection, or rendering error occurs
- **THEN** the browser receives a safe unavailable state with no SQL text, binding name, internal identifier, provider payload, stack trace, or raw diagnostic

### Requirement: Live views refresh without optimistic state
The portal SHALL obtain a fresh authenticated projection on initial load and while a run view remains active. After a successful response, it SHALL start the next poll within ten seconds while the page is visible, SHALL poll immediately when a hidden page becomes visible again, and SHALL never advance the graph between confirmed responses. Each projection SHALL identify when it was observed and when the selected D1 run was last updated.

#### Scenario: D1 changes between polls
- **WHEN** a later poll returns a newer confirmed visit or status for the selected run
- **THEN** the portal updates the graph, history, stage counts, and status together from that response

#### Scenario: No durable change is recorded
- **WHEN** consecutive polls return the same D1 visit and status
- **THEN** the portal preserves the same confirmed workflow state and does not infer progress from elapsed time or Linear status

#### Scenario: Poll fails after confirmed data was shown
- **WHEN** a refresh cannot confirm current D1 state
- **THEN** the portal marks status as unconfirmed or unavailable, retains the last confirmed observation time, and does not present cached data as current

#### Scenario: Browser tab becomes visible
- **WHEN** the portal returns to a visible browser state after polling was paused
- **THEN** it requests a fresh authenticated projection before claiming that the displayed status is current

### Requirement: The approved presentation remains recognizable and provider-neutral
The portal SHALL preserve the approved blue-charcoal workflow-map direction with System, Light, and Dark themes. It SHALL make the active stage and matching issue unmistakable with restrained breathing motion, while a reduced-motion preference SHALL remove that animation and retain a clear static active treatment. User-facing product copy SHALL not name Cloudflare, D1, R2, Workers, Sandboxes, or other hosting infrastructure.

#### Scenario: Operator selects a theme
- **WHEN** the operator selects System, Light, or Dark
- **THEN** the portal applies that choice across the issue rail, workflow map, status, and detail surfaces and preserves the choice for later visits

#### Scenario: Active work is displayed
- **WHEN** the selected run has active work and motion is permitted
- **THEN** the active stage and matching issue use the approved restrained breathing treatment

#### Scenario: Reduced motion is requested
- **WHEN** the browser requests reduced motion
- **THEN** the active-state animations stop and a static visual treatment still identifies the active stage and issue

#### Scenario: Operator reads portal copy
- **WHEN** issue, workflow, wait, failure, or detail text is displayed
- **THEN** it describes DEOS product state and required action without exposing hosting-provider terminology

### Requirement: Completion evidence proves real live and terminal paths
Completion SHALL include deterministic coverage of authorization, read-only access, projection, redaction, run selection, graph cycles, history, work links, polling, themes, and reduced motion. It SHALL also include provider-originated evidence in which real Linear events drive the deployed DEOS system and durable D1 records, and the deployed portal displays both a live wait-and-resumption path and a terminal path. Synthetic ingress and deterministic tests SHALL be labeled separately and SHALL NOT be presented as provider-originated end-to-end proof.

#### Scenario: Live human wait resumes
- **WHEN** a real provider-originated Linear issue reaches a human wait and the authorized human performs the configured resume transition
- **THEN** read-only D1 evidence records the wait and subsequent visit and sanitized portal screenshots show the matching waiting and resumed states

#### Scenario: Real run becomes terminal
- **WHEN** a real provider-originated run reaches a terminal DEOS outcome
- **THEN** read-only D1 evidence and a sanitized portal screenshot show the same run sequence, terminal outcome, final visit, definition version, and digest

#### Scenario: Only synthetic proof exists
- **WHEN** the deployed portal has been tested only with locally generated requests, fixtures, or deterministic tests
- **THEN** the change is not reported as provider-originated end-to-end verified
