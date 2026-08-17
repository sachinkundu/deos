## Why

The controlled repository needs a small, deterministic CLI canary that exercises the full native OpenSpec lifecycle while remaining easy to review and verify.

## What Changes

- Add a Python calculator CLI for two numeric operands with add, subtract, multiply, and divide operations.
- Print only the numeric result on success and return exit status 0.
- Reject division by zero with a concise stderr message and a non-zero exit status.
- Add deterministic pytest coverage for all four operations and division by zero.
- Preserve the repository's existing validation and avoid external dependencies or deployment.

Non-goals include interactive calculator sessions, expression parsing, advanced mathematical operations, deployment, and third-party runtime dependencies.

## Capabilities

### New Capabilities

- `calculator-cli`: Defines the command-line interface, arithmetic behavior, output, and error handling for a two-operand calculator.

### Modified Capabilities

None.

## Impact

The change adds a small Python CLI module and focused tests within this repository. It does not alter existing workflow behavior, external APIs, infrastructure, or dependencies.