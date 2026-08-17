## Purpose

Defines a deterministic command-line calculator for applying one basic arithmetic operation to exactly two numeric operands.

## ADDED Requirements

### Requirement: Supported arithmetic operations
The calculator CLI SHALL accept an operation of `add`, `subtract`, `multiply`, or `divide` and exactly two numeric operands, and SHALL compute the corresponding arithmetic result.

#### Scenario: Add two operands
- **WHEN** the CLI is invoked with `add` and two valid numeric operands
- **THEN** it computes their sum

#### Scenario: Subtract two operands
- **WHEN** the CLI is invoked with `subtract` and two valid numeric operands
- **THEN** it computes the second operand subtracted from the first

#### Scenario: Multiply two operands
- **WHEN** the CLI is invoked with `multiply` and two valid numeric operands
- **THEN** it computes their product

#### Scenario: Divide two operands
- **WHEN** the CLI is invoked with `divide` and two valid numeric operands and the second operand is non-zero
- **THEN** it computes the first operand divided by the second

### Requirement: Successful command output
For a valid operation, the calculator CLI SHALL write only the numeric result followed by a newline to standard output, SHALL write nothing to standard error, and SHALL exit with status 0.

#### Scenario: Successful invocation
- **WHEN** the CLI completes a supported operation with valid operands
- **THEN** standard output contains only the numeric result followed by a newline, standard error is empty, and the exit status is 0

### Requirement: Division by zero handling
The calculator CLI SHALL reject division by zero without printing a result, SHALL write a concise error message to standard error, and SHALL exit with a non-zero status.

#### Scenario: Zero divisor
- **WHEN** the CLI is invoked with `divide` and the second operand is zero
- **THEN** standard output is empty, standard error contains a concise division-by-zero error, and the exit status is non-zero