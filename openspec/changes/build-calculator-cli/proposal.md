## Why

The controlled repository needs a small provider-originated canary that proves the native OpenSpec workflow can carry a readable feature from requirements through archive. A calculator CLI provides deterministic behavior that is narrow enough to audit in one workflow run.

## What Changes

- Add a Python command-line calculator for exactly two numeric operands.
- Support add, subtract, multiply, and divide operations.
- Print only the numeric result to stdout and exit successfully for valid invocations.
- Report division by zero concisely on stderr and exit non-zero.
- Add deterministic pytest coverage for every operation and division by zero while keeping existing validation green.
- Keep the feature repository-local with no deployment or external dependencies.

### Non-goals

- Interactive, stateful, or multi-operand calculation.
- Additional mathematical operations, expression parsing, deployment, or third-party packages.

## Capabilities

### New Capabilities

- `calculator-cli`: Define the supported binary operations, successful output and exit behavior, and division-by-zero failure behavior for the calculator command.

### Modified Capabilities

None.

## Impact

- Adds a small Python CLI entry point and deterministic pytest coverage within this repository.
- Adds no external API, deployment target, production credential, or third-party dependency.