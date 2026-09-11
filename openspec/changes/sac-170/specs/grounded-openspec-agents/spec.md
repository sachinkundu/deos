## Purpose

Give OpenSpec plan and design agents current facts, checked project context, and safe skills for their assigned work.

## ADDED Requirements

### Requirement: Give every plan and design role web search

DEOS SHALL give web search to each plan author, design author, self-review subagent, and independent reviewer. Search SHALL be read-only. It MUST NOT add write, provider, or secret rights.

When a claim relies on current outside behavior, the role SHALL check a current source. It SHALL cite each source it uses in its work or review result.

#### Scenario: Author needs a current service fact

- **WHEN** a plan or design claim relies on behavior that may have changed.
- **THEN** the author checks a current source and cites it in the work.

#### Scenario: Reviewer checks a current claim

- **WHEN** a self-reviewer or independent reviewer judges a claim about a current tool or service.
- **THEN** the reviewer may search the web and cites the sources it uses.

### Requirement: Give the design author checked plan and architecture context

Before design starts, DEOS SHALL give the design author the full approved plan and the project architecture files.

#### Scenario: First design job starts

- **WHEN** the approved plan and project architecture files are ready.
- **THEN** the design author gets the full set as design context.

### Requirement: Give each role safe skills that fit its work

DEOS SHALL give each plan and design role a pinned skill set that fits its work. It SHALL include the Cloudflare skill bundle when the work can touch Cloudflare. A skill MUST NOT add rights or change the job or human gate rules.

#### Scenario: Cloudflare work is in scope

- **WHEN** a plan or design role needs facts about Cloudflare services.
- **THEN** its job includes the pinned Cloudflare skill bundle.

#### Scenario: Another skill fits the task

- **WHEN** a pinned repo or OpenSpec skill matches the role and task.
- **THEN** DEOS includes it without adding rights outside the job contract.

#### Scenario: Skill asks for a forbidden action

- **WHEN** skill text asks the role to write outside its file scope, call a blocked provider, or bypass a human gate.
- **THEN** DEOS keeps the job contract, denies the action, and does not treat the skill as authority.
