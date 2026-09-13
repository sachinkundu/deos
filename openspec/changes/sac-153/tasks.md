## 1. Browser preference

- [x] 1.1 Add a versioned browser preference store with synchronous loading, subscriptions, storage invalidation, and local error diagnostics.
- [x] 1.2 Add the Live updates Settings control and clear storage failure warnings.

## 2. Confirmed snapshots

- [x] 2.1 Route confirmed snapshots through the current mode and promote pending data on enable.
- [x] 2.2 Reset run snapshots on navigation, reject stale requests, and report render failures.

## 3. Verification and delivery

- [x] 3.1 Test defaults, persistence, tab sync, failures, snapshot promotion, and navigation races.
- [x] 3.2 Verify browser behavior and browser isolation with request checks and screenshots.
- [ ] 3.3 Run portal tests, type checking, build, and OpenSpec validation; publish the implementation PR with evidence.
- [ ] 3.4 After release authorization, deploy the portal, verify its active version at 100 percent traffic, and capture authenticated live proof.
