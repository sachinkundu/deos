## 1. Contract and live baseline

- [x] 1.1 Verify Linear state assignment and safe transient error contracts; inspect SAC-160 in Linear and D1.

## 2. Implementation

- [x] 2.1 Add a typed, bounded Done request to the trusted Linear client without receipts or issue-state reads.
- [x] 2.2 Notify only after an owned success commit or exact replay, with three local attempts and a catch-all boundary.
- [x] 2.3 Test ordering, replay authority, retry limits, unknown failures, and non-success paths.

- [x] 2.4 Fix the Python null binding exposed by the returning Done webhook, preserving ignored classification.

## 3. Verification and delivery

- [x] 3.1 Run backend checks and strict OpenSpec validation.
- [x] 3.2 Exercise the deployed path using SAC-160 where safe; capture ordered provider deliveries and unchanged D1 success, plus a controlled failure.
- [x] 3.3 Capture visual and executable evidence and publish the implementation PR linked to PRs 88 and 89.
