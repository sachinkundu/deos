## ADDED Requirements

### Requirement: Bind a design choice to the full candidate

Each design gate visit SHALL bind one pull request and its exact head. It SHALL also bind the draft proposal, all delta specs, the design, and the last approved plan. The proposal and full spec set SHALL form one plan version with one hash. If the draft changes the plan, the old plan choice MUST NOT cover the new plan version.

Only an allowed person may make the merge choice for that gate visit. That choice SHALL cover the changed plan and design. An author, review, comment, check, or old choice MUST NOT approve the merge.

#### Scenario: A changed plan reaches the design gate

- **WHEN** a checked design candidate differs from the last approved proposal or delta specs.
- **THEN** the gate asks an allowed person for a fresh choice on the full candidate at its exact head.

#### Scenario: An old approval is presented

- **WHEN** an agent or provider event cites the earlier plan approval for changed work.
- **THEN** the workflow keeps the design gate open and waits for a fresh choice.

#### Scenario: The candidate head changes

- **WHEN** the pull request head changes after a design gate visit opens.
- **THEN** that visit cannot approve the new head.
- **AND** a current visit is required.

### Requirement: Keep plan revision inside the Design phase

A design plan edit SHALL stay in the current Design phase and design pull request. It MUST NOT make a new Planning phase, planning pull request, or planning gate visit. A failed, canceled, or open design round MUST NOT replace the last approved plan.

#### Scenario: Design revision is requested

- **WHEN** an allowed person sends a design candidate back for changes.
- **THEN** the workflow starts another design round on the same design pull request.
- **AND** it does not return to the Planning phase.

#### Scenario: A revised candidate is canceled

- **WHEN** a design round with plan edits is canceled or ends without merge.
- **THEN** the last approved plan stays current.
- **AND** the unmerged candidate remains in history.

### Requirement: Preserve each plan approval in order

The workflow SHALL treat the full plan version as one approval unit. It MUST NOT split choice scope by file, capability, or need. A fresh design gate choice SHALL cover the whole draft plan and design at that head.

The workflow SHALL check the merge of an approved design pull request. It SHALL then make that plan, design, and human choice the current set. The new choice SHALL replace the old plan choice as the current choice for the whole plan version.

The workflow SHALL keep each old plan, design, gate visit, actor, choice, head, and merge proof. It MUST NOT rewrite or delete an old choice.

#### Scenario: A changed plan and design are merged

- **WHEN** the exact head approved at the design gate is merged and its files are checked.
- **THEN** the merged plan and design become the current approved set.
- **AND** the fresh design gate choice covers the full plan version and design.

#### Scenario: A person views the old approval

- **WHEN** a later choice has replaced an earlier plan choice for the current plan version.
- **THEN** the old plan and choice remain in history with their first scope and order.

#### Scenario: Merge proof does not match

- **WHEN** the merged head or checked files do not match the approved design candidate.
- **THEN** the workflow keeps the prior approved set current and calls for repair.
