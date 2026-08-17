## 1. Deterministic Tests

- [ ] 1.1 Add parameterized pytest coverage for add, subtract, multiply, and divide using deterministic operands and expected numeric output.
- [ ] 1.2 Add a CLI-level pytest case asserting division by zero produces no stdout, a concise stderr error, and a non-zero exit status.

## 2. Calculator CLI

- [ ] 2.1 Add the package-native calculator module with standard-library parsing for an operation and exactly two numeric operands.
- [ ] 2.2 Implement the four-operation arithmetic dispatcher and explicit division-by-zero handling.
- [ ] 2.3 Implement the thin command adapter so successful invocations print only the numeric result and return 0 while division by zero follows the specified error contract.

## 3. Verification

- [ ] 3.1 Run the focused calculator pytest suite and manually exercise one success and the division-by-zero path.
- [ ] 3.2 Run the repository's full pytest, Ruff, and Pyright validation and resolve any regressions.
- [ ] 3.3 Validate the OpenSpec change strictly before syncing and archiving it in the later workflow stages.