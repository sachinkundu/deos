## Purpose

Provide a deterministic, dependency-free command-line calculator with a narrow invocation contract and testable arithmetic and error behavior.

## ADDED Requirements

### Requirement: Supported invocation surface
The calculator SHALL be invokable as `PYTHONPATH=src python -m deos.calculator <operation> <left> <right>`. It SHALL accept exactly the operations `add`, `subtract`, `multiply`, and `divide`, and both operands SHALL be numeric values.

#### Scenario: Invoke the calculator module
- **WHEN** a user runs `PYTHONPATH=src python -m deos.calculator add 2 3`
- **THEN** the process exits with status 0 and writes only the numeric result `5` to stdout

#### Scenario: Reject an unsupported operation
- **WHEN** a user invokes the calculator with an operation other than `add`, `subtract`, `multiply`, or `divide`
- **THEN** the process exits with a non-zero status and does not produce a numeric result on stdout

#### Scenario: Reject a non-numeric operand
- **WHEN** a user invokes a supported operation with either operand not representing a numeric value
- **THEN** the process exits with a non-zero status and does not produce a numeric result on stdout

### Requirement: Arithmetic operations
For valid numeric operands, the calculator SHALL compute the selected arithmetic operation and SHALL write only its numeric result to stdout before exiting with status 0.

#### Scenario: Add operands
- **WHEN** a user invokes `add` with operands `2` and `3`
- **THEN** stdout contains only the numeric result `5` and the process exits with status 0

#### Scenario: Subtract operands
- **WHEN** a user invokes `subtract` with operands `7` and `2`
- **THEN** stdout contains only the numeric result `5` and the process exits with status 0

#### Scenario: Multiply operands
- **WHEN** a user invokes `multiply` with operands `2.5` and `4`
- **THEN** stdout contains only the numeric result `10` and the process exits with status 0

#### Scenario: Divide operands
- **WHEN** a user invokes `divide` with operands `7.5` and `2.5`
- **THEN** stdout contains only the numeric result `3` and the process exits with status 0

### Requirement: Division by zero failure
The calculator SHALL treat division by numeric zero as an error, write a concise error message to stderr, write no numeric result to stdout, and exit with a non-zero status.

#### Scenario: Divide by zero
- **WHEN** a user invokes `divide` with a zero right operand
- **THEN** the process writes a concise division-by-zero error to stderr, writes no numeric result to stdout, and exits with a non-zero status

### Requirement: Deterministic verification
The repository SHALL include deterministic pytest coverage for all four supported operations, the exact module invocation surface, and division by zero, and the repository's complete existing validation SHALL remain green.

#### Scenario: Run calculator coverage
- **WHEN** the calculator pytest coverage is run in the repository's controlled environment
- **THEN** tests exercise `add`, `subtract`, `multiply`, `divide`, the exact `PYTHONPATH=src python -m deos.calculator` invocation surface, and division by zero without external services

#### Scenario: Run complete repository validation
- **WHEN** the repository's complete existing validation suite is run after the change
- **THEN** it completes successfully
