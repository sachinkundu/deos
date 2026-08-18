## Purpose

Provides an exact repository-local marker whose presence and content prove the workflow v10 native OpenSpec archive path without external effects.

## ADDED Requirements

### Requirement: Terminal archive canary marker
The repository SHALL contain `canary/terminal-archive-v10.txt` with the exact newline-terminated content `terminal-mechanical-archive-v10\n`.

#### Scenario: Marker is present with exact content
- **WHEN** the terminal archive canary marker is inspected from the repository root
- **THEN** the file exists at `canary/terminal-archive-v10.txt`
- **AND** its complete byte content is `terminal-mechanical-archive-v10\n`

### Requirement: Deterministic marker verification
The repository SHALL include one focused Node test that verifies the marker path and exact byte content without network access, credentials, deployment, or mutable external state.

#### Scenario: Focused verification succeeds
- **WHEN** the focused Node test runs against a conforming checkout
- **THEN** it passes after confirming the marker exists and contains exactly `terminal-mechanical-archive-v10\n`
