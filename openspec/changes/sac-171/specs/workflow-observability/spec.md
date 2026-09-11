## ADDED Requirements

### Requirement: Show the sandbox tier for a run

The portal SHALL show the saved sandbox tier for each run. It SHALL use the run record as its source. It MUST NOT guess the tier from the issue's current labels or from one agent attempt.

Each sandbox attempt record and its safe telemetry SHALL name the saved run tier. This fact SHALL let an operator check that all author, review, and retry attempts used the same tier.

#### Scenario: Person views a Standard-2 run

- **WHEN** a person opens a run whose saved tier is Standard-2.
- **THEN** the portal shows Standard-2 as that run's sandbox tier.

#### Scenario: Person views a Basic run

- **WHEN** a person opens a run whose saved tier is Basic.
- **THEN** the portal shows Basic as that run's sandbox tier.

#### Scenario: Current labels differ from the saved choice

- **WHEN** a person opens a run after its issue labels have changed.
- **THEN** the portal still shows the tier saved on the run.

#### Scenario: Operator checks all attempts

- **WHEN** an operator traces the author, review, and retry attempts for one run.
- **THEN** each attempt names the same tier as the run.

### Requirement: Keep timing facts for the tier trial

The system SHALL record the saved tier with the start time, end time, stage, and outcome of each sandbox attempt. It SHALL use the same time source and stage names for both tiers. The records SHALL support a controlled check of elapsed time for like work on Basic and Standard-2.

The trial result SHALL report the sample size and elapsed-time result for each tier. It SHALL keep failed or retried attempts clear from first-pass success. The trial result MUST NOT choose the long-term default.

#### Scenario: Like work runs on both tiers

- **WHEN** a controlled trial runs like workflow stages on Basic and Standard-2.
- **THEN** the saved facts let an operator compare elapsed time, outcome, and retry use by tier.

#### Scenario: Trial includes a failed attempt

- **WHEN** an attempt fails or needs a retry during the trial.
- **THEN** the result keeps that attempt in the sample and marks it apart from first-pass success.

#### Scenario: Trial data is viewed

- **WHEN** an operator reviews the tier trial.
- **THEN** the result shows the sample size and elapsed-time result for each tier without choosing the long-term default.
