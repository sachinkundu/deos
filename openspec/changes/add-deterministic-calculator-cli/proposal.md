## Why

The controlled repository needs a small, deterministic command-line feature that can exercise the complete native OpenSpec lifecycle with precise, dependency-free acceptance criteria.

## What Changes

- Add a Python calculator module invokable as `PYTHONPATH=src python -m deos.calculator <operation> <left> <right>`.
- Support exactly `add`, `subtract`, `multiply`, and `divide` with numeric operands.
- Print only the numeric result on success and report division by zero concisely on stderr with a non-zero exit.
- Add deterministic pytest coverage for every operation, the exact invocation surface, and division by zero.
- Non-goals: deployment, additional operations, an interactive interface, and third-party dependencies.

## Capabilities

### New Capabilities

- `calculator-cli`: Defines the supported calculator command, operations, output, errors, and verification behavior.

### Modified Capabilities

None.

## Impact

Adds `src/deos/calculator.py`, tests under `tests/`, and a new local CLI surface. No deployed systems, existing APIs, or dependencies change.
