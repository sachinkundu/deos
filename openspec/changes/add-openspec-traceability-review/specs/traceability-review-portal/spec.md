## Purpose

Let an allowed user read exact-head OpenSpec review proof and findings in the DEOS portal.

## ADDED Requirements

### Requirement: Choose the independent review model in settings

The DEOS settings page SHALL list the OpenRouter models that DEOS supports for independent review. An allowed operator SHALL choose one model for new runs. DEOS SHALL save the provider and model with a settings revision. A new run SHALL copy that choice into its fixed run data. An active run MUST NOT change models when the setting changes. The page MUST NOT show or accept the raw OpenRouter key.

#### Scenario: Operator saves an independent model

- **WHEN** an allowed operator selects a supported OpenRouter model and saves the settings
- **THEN** DEOS reads back the new settings revision and uses that choice only for later runs

#### Scenario: Model choice is missing or unsupported

- **WHEN** a new review run has no supported OpenRouter model in its saved settings
- **THEN** DEOS rejects independent-review dispatch before any model call

### Requirement: Show one protected review view

The DEOS portal SHALL have a guarded review page for a flow run. The `Create Planning PR` node popup SHALL show a `View review trace` link when saved review proof exists. The normal workflow graph SHALL not add a separate self-check node. The review page SHALL show the Linear issue, run, and planning pull request. It SHALL show the chosen head, author coding agent Codex model, and independent OpenRouter model. It SHALL show both directional passes, confirmed links, one-sided disputed links, findings, and author dispositions. It SHALL distinguish completed review work from a semantic claim that needs human judgment. It SHALL show reused results, stale reasons, same-stage proof conflicts, and safe proof links.

#### Scenario: Authorized operator opens a review

- **WHEN** an allowed user opens the review page for a known run
- **THEN** the portal loads its saved review rows and safe files

#### Scenario: Operator opens the planning node

- **WHEN** the `Create Planning PR` node has saved self-check or independent-review proof
- **THEN** its popup shows a link to the guarded review page without adding a self-check node to the workflow graph

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

- **WHEN** a later result from the same review stage conflicts with its fixed rating from the same round
- **THEN** the page shows both results and the human-judgment state instead of presenting it as an ordinary repair cycle

#### Scenario: Self-check turns end with findings open

- **WHEN** a round reaches human review after the self-check uses its three-turn limit
- **THEN** the page labels it `needs judgment` and keeps every open finding and model disagreement visible

#### Scenario: Directional passes disagree

- **WHEN** only one pass claims a proposal-to-requirement relationship
- **THEN** the page identifies its direction, shows both rationales or the absent claim, and does not present it as a confirmed link

#### Scenario: Author responds to external review

- **WHEN** the author applies, declines, or makes no change for a review item
- **THEN** the page shows that disposition beside the original item and keeps both reviewed and resulting head identities

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

After the outside review and author response, DEOS SHALL update one short GitHub check. It SHALL state that external review completed and show confirmed-link, disputed-link, finding, and author-disposition counts. It SHALL also update one short Linear review link or file. Both SHALL link to the guarded portal page. Full findings SHALL stay in the saved proof and portal.

#### Scenario: Independent review completes

- **WHEN** DEOS saves a final outside review for a posted head
- **THEN** GitHub and Linear show its short state and a link to the guarded page

#### Scenario: Provider status is retried

- **WHEN** a check or link retry follows an unclear reply
- **THEN** DEOS reads provider state and updates the same record with no copy
