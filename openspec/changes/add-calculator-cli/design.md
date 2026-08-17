## Context

See `proposal.md` for motivation and `specs/calculator-cli/spec.md` for observable behavior. The repository already packages Python from `src/deos` and validates with pytest, Ruff, and Pyright; the calculator must remain local, deterministic, and dependency-free.

## Goals / Non-Goals

**Goals:**

- Keep argument parsing, arithmetic dispatch, and process I/O small and independently testable.
- Integrate with the existing Python package and validation tools.

**Non-Goals:**

- Establish a reusable expression engine or plugin architecture.
- Add persistence, networking, deployment, or runtime dependencies.

## Decisions

### Package-native module with a thin CLI boundary

Add one calculator module under the existing `deos` package. Its command entry function parses the operation and two operands, delegates calculation to a pure function, and translates expected errors into stderr and a non-zero status. This keeps deterministic arithmetic tests separate from process-level output tests. A standalone script was considered but rejected because it would bypass the repository's package and type-checking conventions.

### Standard-library parsing and numeric representation

Use only the Python standard library for argument parsing and numeric conversion. Represent operands with a built-in numeric type and format results consistently so successful output contains no labels. A third-party CLI framework was rejected because the required interface is too small to justify a dependency.

### Component diagram

```text
command arguments
       |
       v
CLI parser / exit-code adapter ---> stdout or stderr
       |
       v
pure arithmetic dispatcher
```

### Event flow

1. The caller supplies an operation and two operands.
2. The CLI validates and converts the arguments.
3. The arithmetic dispatcher computes the result or identifies a zero divisor.
4. The CLI writes to exactly one output stream and returns the required status.

### Minimal data model

No persistent data is introduced. Each invocation uses an operation token, two numeric operand values, and either a numeric result or a division-by-zero error.

## Risks / Trade-offs

- [Built-in numeric formatting can expose floating-point representation details] → Choose representative deterministic test values and define one consistent output conversion path.
- [Parser-generated errors may differ from the explicit division-by-zero error] → Keep division-by-zero handling inside the controlled CLI adapter and test its streams and exit status directly.
- [A new console-script entry point could affect packaging metadata] → Prefer module execution unless repository conventions clearly favor an entry point, and run the full existing validation suite.

## Migration Plan

Add the module and tests without changing existing behavior or data. Rollback consists of removing those additions; no deployed resources, stored data, or dependency changes require migration.

## Failure Modes

- Division by zero produces the specified concise stderr error and non-zero exit.
- Invalid operation names or malformed operands are rejected by argument parsing and do not execute arithmetic.
- Unexpected internal errors remain non-successful and must not be presented as valid numeric results.