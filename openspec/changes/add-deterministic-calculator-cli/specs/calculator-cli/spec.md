## Purpose

Defines a deterministic, dependency-free command-line calculator for exercising the repository's native OpenSpec delivery lifecycle.

## ADDED Requirements

### Requirement: Exact command surface
The calculator SHALL be invokable as `PYTHONPATH=src python -m deos.calculator <operation> <left> <right>`, SHALL accept exactly the operations `add`, `subtract`, `multiply`, and `divide`, and SHALL require both operands to be numeric values.

#### Scenario: Supported invocation
- **WHEN** a user invokes the module with one supported operation and two numeric operands
- **THEN** the calculator evaluates that operation using the supplied operands

#### Scenario: Unsupported operation
- **WHEN** a user supplies an operation other than `add`, `subtract`, `multiply`, or `divide`
- **THEN** the calculator exits non-zero without producing a numeric result

#### Scenario: Non-numeric operand
- **WHEN** either operand is not numeric
- **THEN** the calculator exits non-zero without producing a numeric result

### Requirement: Deterministic arithmetic results
For a valid invocation, the calculator SHALL apply the selected arithmetic operation in left-to-right operand order, print only the numeric result followed by a newline to stdout, print nothing to stderr, and exit with status 0.

#### Scenario: Addition
- **WHEN** the calculator receives `add 2 3`
- **THEN** it prints the numeric result `5.0` to stdout and exits 0

#### Scenario: Subtraction
- **WHEN** the calculator receives `subtract 7 2`
- **THEN** it prints the numeric result `5.0` to stdout and exits 0

#### Scenario: Multiplication
- **WHEN** the calculator receives `multiply 2 3`
- **THEN** it prints the numeric result `6.0` to stdout and exits 0

#### Scenario: Division
- **WHEN** the calculator receives `divide 7 2`
- **THEN** it prints the numeric result `3.5` to stdout and exits 0

### Requirement: Division by zero failure
The calculator MUST reject division by a numeric zero denominator, print a concise error to stderr, print nothing to stdout, and exit non-zero.

#### Scenario: Zero denominator
- **WHEN** the calculator receives `divide 1 0`
- **THEN** it prints a concise division-by-zero error only to stderr and exits non-zero

### Requirement: Deterministic verification
The repository SHALL include deterministic pytest coverage for all four operations, the exact module invocation surface, and division by zero, and the complete existing repository validation SHALL remain green.

#### Scenario: Calculator test suite
- **WHEN** the repository test suite runs without network access or production credentials
- **THEN** it verifies every required operation, CLI behavior, and division-by-zero behavior reproducibly

