## 1. Deterministic Tests

- [ ] 1.1 Add parameterized unit tests covering add, subtract, multiply, and divide with numeric operands and left-to-right semantics.
- [ ] 1.2 Add subprocess tests for the exact `PYTHONPATH=src python -m deos.calculator <operation> <left> <right>` surface, successful stdout-only output, and zero-denominator stderr/non-zero behavior.
- [ ] 1.3 Add negative CLI cases proving unsupported operations and non-numeric operands do not produce numeric results and exit non-zero.

## 2. Calculator Implementation

- [ ] 2.1 Add `src/deos/calculator.py` with standard-library argument parsing, float operands, and explicit dispatch limited to the four supported operations.
- [ ] 2.2 Add module entry-point handling that prints only the numeric result on success and handles division by zero concisely without a traceback.

## 3. Verification

- [ ] 3.1 Run the calculator-focused deterministic pytest coverage and record the outcome.
- [ ] 3.2 Run the repository's complete existing validation suite and confirm it remains green.
- [ ] 3.3 Validate the OpenSpec change strictly and reconcile the implementation checklist with completed work.
