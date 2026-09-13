## 1. Implementation

- [x] 1.1 Switch the ingress default to the existing Basic policy and retain old policy behavior.
- [x] 1.2 Add the authenticated completion endpoint with active attempt and visit checks.
- [x] 1.3 Notify after supervisor output is finalized on success and failure, preserving notification errors.
- [x] 1.4 Wake existing reconciliation and handle the notification/process-exit race with one short follow-up wait.

## 2. Validation and release

- [x] 2.1 Cover authentication, stale attempts, duplicates, early hints, lost hints, and preserved failure outcomes with focused tests.
- [x] 2.2 Run the repository checks and strict OpenSpec validation; publish a review-ready PR and address review findings.
- [x] 2.3 Release the backend and Basic ingress; verify active versions and a real provider run with durable cleanup evidence.
- [x] 2.4 Reconcile the checklist and archive the change after the release proof passes.
