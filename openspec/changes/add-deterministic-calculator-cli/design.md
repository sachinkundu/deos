## Context

See `proposal.md` for motivation and `specs/calculator-cli/spec.md` for observable behavior. The repository already uses a `src/` Python layout and pytest; this feature must remain local, deterministic, dependency-free, and undeployed.

## Goals / Non-Goals

**Goals:**

- Keep parsing, arithmetic dispatch, and process exit behavior in one small module with a directly testable entry point.
- Make subprocess tests prove the exact `python -m` interface in addition to unit-level arithmetic behavior.

**Non-Goals:**

- Persisting calculations, exposing a service, or introducing extensibility machinery for unrequested operations.

## Decisions

### Use the standard library and floating-point operands

Parse both operands with Python's built-in `float` conversion and dispatch through an explicit mapping limited to the four named operations. This gives one consistent numeric representation, including decimals and signed values, without dependencies. Alternatives considered were integer-only parsing, which does not satisfy general numeric operands, and `Decimal`, whose extra formatting and precision contract are not required.

### Separate calculation from CLI orchestration

Keep a small calculation function independent of argument parsing and a `main` function responsible for stdout, stderr, and exit status. This makes arithmetic easy to test while preserving subprocess tests as the authority for the public invocation. A single inline command handler was rejected because it couples computation to process I/O.

### Component diagram and event flow

```text
command arguments -> module entry point -> argument parser -> operation dispatch
                                                        -> stdout + exit 0
                                                        -> stderr + non-zero exit
```

Event flow: Python loads `deos.calculator` as a module, the entry point parses exactly three positional arguments, the calculator dispatches the selected operation, and the CLI renders either the result or a concise error.

### Minimal data model

No persisted model is introduced. Runtime state consists only of an operation name and two floating-point operands; the output is one floating-point result or one error condition.

### Verification boundary

Use parameterized pytest cases for arithmetic and subprocess execution with `PYTHONPATH=src` for the exact public surface. No network, provider, deployment, or production credential participates in validation.

## Risks / Trade-offs

- [Binary floating-point can display familiar precision artifacts] → Keep the contract to Python numeric output and avoid claiming decimal-finance precision.
- [Argument-parser diagnostics may vary across Python versions] → Assert stable properties such as non-zero status and absence of a numeric stdout result, while asserting the owned division-by-zero message precisely.
- [A unit-only test could miss module-entry regressions] → Include subprocess coverage of the normative invocation.

## Migration Plan

Add the module and tests, run calculator-focused tests, then run the repository's complete validation. No deployment or data migration is required. Rollback consists of reverting the new module, tests, and OpenSpec change.

## Failure Modes

- Unsupported operation or malformed arity: argument parsing reports an error and exits non-zero.
- Non-numeric operand: argument parsing reports an error and exits non-zero.
- Zero denominator: owned CLI handling emits a concise stderr message and exits non-zero without a traceback.
