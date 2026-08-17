## Why

The controlled repository needs a small, deterministic command-line feature that can exercise the native OpenSpec lifecycle from requirements through archive. A dependency-free calculator provides an auditable canary with clear success and failure behavior.

## What Changes

- Add a Python calculator CLI invoked as `PYTHONPATH=src python -m deos.calculator <operation> <left> <right>`.
- Support exactly `add`, `subtract`, `multiply`, and `divide` with numeric operands.
- Print only the numeric result on success and report division by zero concisely on stderr with a non-zero exit status.
- Add deterministic pytest coverage for every operation, the exact invocation surface, and division by zero.

### Non-goals

- Adding dependencies, interactive input, additional operations, or a public Python library API.
- Deploying the calculator or changing the existing DEOS workflow runtime.

## Capabilities

### New Capabilities

- `calculator-cli`: Defines the supported command-line invocation, operations, operands, output, and error behavior.

### Modified Capabilities

None.

## Impact

- Adds `src/deos/calculator.py` and calculator-focused tests under `tests/`.
- Does not add dependencies, deployment resources, or external provider effects.
