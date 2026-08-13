## 1. Freeze the proven ingress contract

- [ ] 1.1 Record the active Python Worker version, canonical URL, binding/resource identifiers, compatibility settings, and executable rollback command.
- [ ] 1.2 Create shared byte-level contract fixtures for methods, valid relevant/irrelevant deliveries, duplicate delivery, stale timestamp, missing/malformed headers, invalid signature/payload, and Queue failure.
- [ ] 1.3 Run the fixtures against the Python baseline and record the exact HTTP, D1, Queue, and correlation outcomes before implementing TypeScript.

## 2. Implement the TypeScript HTTP adapter

- [ ] 2.1 Implement method handling, exact `ArrayBuffer` HMAC verification, millisecond freshness checks, case-insensitive headers, and post-verification ACL translation.
- [ ] 2.2 Implement compatible D1 delivery recording, classification, duplicate handling, Queue publication, correlation propagation, and HTTP `200` semantics for accepted/ignored/duplicate paths.
- [ ] 2.3 Add the TypeScript Worker entrypoint and Wrangler configuration while preserving existing binding names, resources, Queue message fields, and storage schemas.

## 3. Prove parity and deployment safety

- [ ] 3.1 Make every shared contract fixture pass in TypeScript and add focused tests for raw byte differences, retries, D1/Queue adapter failures, and telemetry redaction.
- [ ] 3.2 Run TypeScript tests and complete type checks, linting, retained Python domain tests, both Worker dry runs, and strict OpenSpec validation.
- [ ] 3.3 Upload a candidate Worker version without promotion, explicitly enable its versioned preview URL, and verify the version and binding fingerprint.

## 4. Capture preview and canonical provider proof

- [ ] 4.1 Point only the Linear sample webhook to the candidate preview URL, capture sanitized configuration, trigger a real transition, and verify fresh compatible D1/Queue workflow evidence.
- [ ] 4.2 Promote that exact candidate as a single-version 100% deployment, trigger a second real transition at the canonical URL, and capture fresh delivery, Queue, workflow, telemetry, and visual evidence.
- [ ] 4.3 Exercise or dry-run the recorded rollback path and confirm it requires no destructive schema or binding reversal.

## 5. Complete cleanup and handoff

- [ ] 5.1 Remove only the obsolete Python HTTP adapter and adapter-specific tests after canonical provider proof; retain provider-neutral Python modules unless separately justified.
- [ ] 5.2 Rerun every parity, test, lint, type, dry-run, Showboat, and strict OpenSpec gate after cleanup.
- [ ] 5.3 Attach the deployment, rollback, provider-originated, D1/Queue, and sanitized visual evidence to the SAC-78 implementation PR; mark `initial-architecture` task 7 complete and request approval.
- [ ] 5.4 After all seven parent tasks are approved and merged, sync the delta specs to main specs and archive `initial-architecture` with final validation evidence.
