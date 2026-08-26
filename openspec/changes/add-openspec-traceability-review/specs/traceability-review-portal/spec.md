## Purpose

Let an allowed user read exact-head OpenSpec review proof and findings in the DEOS portal.

## ADDED Requirements

### Requirement: Show one protected review view

The DEOS portal SHALL have a guarded review page for a flow run. The page SHALL show the Linear issue, run, and planning pull request. It SHALL show the chosen head and the author and review models. It SHALL show each phase, round, result, base finding, and fix. It SHALL distinguish a closed finding set from a closed review phase. It SHALL show reused results, stale reasons, proof conflicts, and superseding decisions. It SHALL also show safe proof links.

#### Scenario: Authorized operator opens a review

- **WHEN** an allowed user opens the review page for a known run
- **THEN** the portal loads its saved review rows and safe files

#### Scenario: User lacks access

- **WHEN** a request has no valid portal access
- **THEN** DEOS does not show the page or its guarded proof

#### Scenario: Review is still running

- **WHEN** the chosen review is still in work
- **THEN** the page shows saved progress and does not make the web call own the job

#### Scenario: Saved result avoids another model job

- **WHEN** a review input reuses an accepted result
- **THEN** the page names the original result and states that no new semantic job ran

#### Scenario: Earlier pass is challenged

- **WHEN** a later result conflicts with a fixed rating from the same round
- **THEN** the page shows the conflict and its proof decision instead of presenting it as an ordinary repair cycle

### Requirement: Render citations against the exact reviewed documents

The review page SHALL show accepted plan and spec quotes. Each quote SHALL come from the exact file set named by the review. The page SHALL show the text, file, lines, link type, and related finding or fix.

#### Scenario: Operator follows a trace link

- **WHEN** the user picks a proposal, spec, rule, or finding
- **THEN** the page shows its saved links and quotes from the exact file set

#### Scenario: Citation does not match the snapshot

- **WHEN** a quote path, hash, lines, or text fails its check
- **THEN** the portal does not show that sidecar as accepted proof

### Requirement: Make current and stale states obvious

The portal SHALL compare the head in the outside review with the live pull request head. It MUST NOT show old proof as current for new work. A user MAY pick an old exact-head view. The page SHALL keep its stale mark in sight.

#### Scenario: Current head matches the review

- **WHEN** the pull request head is the chosen reviewed head
- **THEN** the portal labels the proof current for that head

#### Scenario: Pull request has advanced

- **WHEN** the live pull request head is not the chosen reviewed head
- **THEN** the portal marks the proof stale and shows both head IDs

### Requirement: Link concise provider status to detailed proof

After the outside review, DEOS SHALL update one short GitHub check on the exact head. It SHALL also update one short Linear review link or file. Both SHALL link to the guarded portal page. Full findings SHALL stay in the saved proof and portal.

#### Scenario: Independent review completes

- **WHEN** DEOS saves a final outside review for a posted head
- **THEN** GitHub and Linear show its short state and a link to the guarded page

#### Scenario: Provider status is retried

- **WHEN** a check or link retry follows an unclear reply
- **THEN** DEOS reads provider state and updates the same record with no copy
