## 1. Canary Marker

- [x] 1.1 Add `canary/sac-121-pr46-e2e.txt` with the exact bytes `sac-121-pr46-live-e2e\n`.

## 2. Deterministic Verification

- [x] 2.1 Add `tests/sac-121-pr46-e2e.test.ts` that resolves the marker relative to `import.meta.url`, reads it without text decoding, and strictly compares its `Buffer` with the complete expected byte sequence.
- [x] 2.2 Run the focused marker test and the repository Node test suite, confirming verification requires no network access, credentials, deployment, or release operation.

## 3. OpenSpec Validation

- [x] 3.1 Run strict OpenSpec validation for `sac-122` and inspect the implementation diff for exact byte content, scope, and whitespace errors.

## 4. Attempt Work Product

- [x] 4.1 At the final publishing step for each agent attempt, publish exactly one GitHub work product for that attempt.

## 5. Terminal Archive

- [ ] 5.1 At the authorized terminal archive node, use the native OpenSpec workflow to sync the `sac-121-live-e2e-marker` delta specification into the main specifications and move `sac-122` into `openspec/changes/archive/`.
