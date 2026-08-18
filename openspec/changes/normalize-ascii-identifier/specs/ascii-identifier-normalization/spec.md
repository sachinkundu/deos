## Purpose

Provides a deterministic canonical form for ASCII identifiers so callers can compare and store equivalent textual values consistently.

## ADDED Requirements

### Requirement: Normalize an ASCII identifier
The system SHALL expose normalization as an importable Python function that returns the input identifier after removing surrounding ASCII whitespace, converting ASCII letters to lowercase, and replacing each maximal non-empty run containing spaces or underscores with one hyphen.

#### Scenario: Surrounding whitespace and letter case are normalized
- **WHEN** the function receives `  Example ID  `
- **THEN** it returns `example-id`

#### Scenario: Mixed separators collapse to one hyphen
- **WHEN** the function receives `ONE__ two_ _THREE`
- **THEN** it returns `one-two-three`

#### Scenario: Other ASCII characters are preserved
- **WHEN** the function receives `  A.B-C  `
- **THEN** it returns `a.b-c`

#### Scenario: Empty normalized value is deterministic
- **WHEN** the function receives only surrounding ASCII whitespace
- **THEN** it returns the empty string

### Requirement: Operate without runtime dependencies
The normalization capability MUST use only PythonsstandardlibraryandSHALLproducethesameresultforthesameinput.nn####Scenario:Repeatednormalizationn-**WHEN**thefunctionreceivesthesameASCIIidentifiermorethanoncen-**THEN**everyinvocationreturnsthesamevaluewithoutrequiringexternalstateorservicesn},{path:openspec/changes/normalize-ascii-identifier/tasks.md,content:##1.DeterministicCoveragenn-[]1.1AddparameterizedpytestcasesfortrimmingASCIIwhitespace,ASCIIlowercaseconversion,collapsingmixedspacesandunderscores,preservingotherASCIIcharacters,emptyresults,andrepeatedcalls.nn##2.UtilityImplementationnn-[]2.1AddthesmallimportablePythonnormalizationfunctionusingonlythestandardlibrary.n-[]2.2Runthefocusedpytestcoverageandtherepositorys configured formatting, lint, and type checks for the changed files.
