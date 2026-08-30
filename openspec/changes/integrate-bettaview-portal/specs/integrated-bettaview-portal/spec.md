## Purpose

Let an allowed reader review one GitHub planning pull request, its exact DEOS trace, and the retained semantic review story in one protected portal.

## ADDED Requirements

### Requirement: Open one governed pull request in two connected views

BettaView SHALL accept a canonical GitHub pull-request URL and show **PR** and **Review** views for the same pull request. The PR view SHALL render the changed documents, GitHub review threads, and inline trace citations. The Review view SHALL combine the accepted trace with its retained semantic review history. BettaView SHALL load the live pull-request head from GitHub and resolve the related DEOS run by repository and pull-request number. It MUST NOT require a run identifier in the entry URL.

#### Scenario: Reader opens a governed planning pull request

- **WHEN** an allowed reader opens BettaView with a governed planning pull-request URL
- **THEN** the portal loads the rendered pull request and connects its review view to the accepted trace and semantic review records for that repository and pull-request number

#### Scenario: Pull request has no DEOS run

- **WHEN** a reader opens a valid pull request that DEOS does not govern
- **THEN** BettaView keeps the pull-request reader available and states that no DEOS trace or review story was found

### Requirement: Preserve exact-head trace meaning

BettaView SHALL render only hash-verified trace data selected by DEOS. It SHALL compare the reviewed head with the live GitHub head and MUST NOT present evidence from an older head as current. The active PR citations and final trace summary SHALL use the complete trace generated for the final published pull-request head. Traces from earlier review candidates MAY remain in the chronological Review story, but MUST NOT supply the active PR citations or final trace summary.

#### Scenario: Reviewed and live heads match

- **WHEN** the accepted trace names the live pull-request head
- **THEN** BettaView labels the trace current and renders its directional links and citations

#### Scenario: Pull request moved after review

- **WHEN** the live pull-request head differs from the reviewed head
- **THEN** BettaView keeps the evidence readable, labels it stale, and shows both head identities

#### Scenario: Author changes the candidate after external review

- **WHEN** an author response changes the pull request after an external trace review
- **THEN** DEOS generates and accepts a complete trace for the new published head before Human Review, and BettaView uses that trace for the active PR citations and final summary

#### Scenario: Final-head trace is unavailable

- **WHEN** no complete hash-verified trace exists for the live pull-request head
- **THEN** BettaView reports the active trace pending or unavailable and does not present an older trace as the final result

### Requirement: Show the focused review story

The **Review** view SHALL show the semantic provenance needed to understand the final pull-request result in chronological order. It SHALL show when author work began, the retained self-review output, author responses and dispositions, the single retained external-review cycle, later final-head trace refreshes, semantic human-review decisions, and the final authored result and reviewed head. It SHALL keep the accepted trace adjacent to that history and link trace findings back to their PR citations. It MUST label missing or redacted review records and MUST NOT reconstruct them from a summary.

The Review view MUST NOT repeat generic Linear transitions, generic workflow transitions, provider-operation records, human waits, cleanup activity, or failed attempts that produced no semantic review output. It MAY include only the human-gate transitions that record a revision request or merge approval because those decisions are part of the semantic review chronology. Other operational records remain available in the main DEOS portal.

#### Scenario: Reader inspects SAC-139

- **WHEN** the reader opens the planning pull request for the completed SAC-139 run
- **THEN** the review view shows its retained author work, self-review, external review, author response, accepted trace, and final reviewed head without starting another workflow

#### Scenario: An older attempt lacks a safe artifact

- **WHEN** a review event refers to content that was not retained or cannot pass its manifest and hash checks
- **THEN** BettaView labels the content unavailable and does not invent or expose it

#### Scenario: Human review requests a later revision

- **WHEN** the author updates an already externally reviewed plan in a new human-requested revision round
- **THEN** DEOS publishes the updated candidate, refreshes the complete trace on the new exact head, and returns to Human Review without running another author self-review or external-discovery cycle

#### Scenario: Human review requests repeated revisions

- **WHEN** the human reviewer requests another revision after a refreshed plan has returned to Human Review
- **THEN** DEOS runs the same author-update, publication, and exact-head trace-refresh loop again and continues to allow later revision rounds until the human reviewer approves or cancels

#### Scenario: Human reviewer requests changes

- **WHEN** a human reviewer comments on the planning pull request and moves the issue from Human Review to In Progress
- **THEN** the Review view shows a human-review revision event between the prior trace and the revision-author work without exposing unrelated workflow transitions

### Requirement: Keep review actions under the human GitHub identity

BettaView SHALL use a GitHub user authorization for pull-request reads and writes. Comments, replies, approvals, change requests, and annotation uploads SHALL use that user's token. BettaView MUST NOT use a shared installation identity for a human review action.

#### Scenario: Authorized reader publishes a review

- **WHEN** a signed-in reader publishes supported comments or a review decision
- **THEN** GitHub records the action under that reader's identity and BettaView reports the provider result

#### Scenario: Reader lacks one write permission

- **WHEN** the reader can open the pull request but lacks permission for a requested write
- **THEN** BettaView keeps reading available and explains which action is unavailable

### Requirement: Keep model execution out of the cloud reader

The cloud BettaView Worker MUST NOT expose a route that starts Codex, another model, or a local trace generator. It SHALL consume only trace and process data already selected by DEOS.

#### Scenario: Client requests trace generation

- **WHEN** a client calls the former trace-generation route on the cloud deployment
- **THEN** BettaView returns a not-found or method-not-allowed response and starts no model work

### Requirement: Offer GitHub and BettaView from DEOS

When a workflow node or visit has a planning pull-request URL, the DEOS node detail SHALL show **Open on GitHub** and **Open in BettaView** actions for that same canonical pull request.

#### Scenario: Reader opens the SAC-139 planning node

- **WHEN** the reader selects the SAC-139 planning node or visit
- **THEN** both actions target its existing planning pull request and the BettaView action carries only the encoded canonical pull-request URL
