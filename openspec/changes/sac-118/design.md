## Context

See `proposal.md` for motivation and `specs/terminal-archive-canary-marker/spec.md` for the observable contract. The repository already runs TypeScript tests with Node's built-in test runner.

## Goals / Non-Goals

**Goals:**

- Represent the canary as one static text file and one focused deterministic test.
- Keep validation independent of services, credentials, and environment configuration.

**Non-Goals:**

- Introducing runtime behavior, persistence, deployment, rollback, or provider integration.
- Modifying unrelated active OpenSpec changes.

## Decisions

Use `canary/terminal-archive-v10.txt` as the sole data artifact and read it from a focused test under `tests/` using Node's built-in filesystem and test APIs. This reuses the existing test runner and adds no dependency. Alternatives such as a runtime endpoint or generated artifact would add effects and nondeterminism without improving the archive proof.

Component and event flow:

```text
Node test -> read repository marker -> compare exact bytes -> pass/fail
```

Minimal data model:

```text
Marker { path: fixed repository-relative path, content: fixed UTF-8 bytes }
```

## Risks / Trade-offs

- [Test runs from a different working directory] -> Resolve the marker relative to the test module/repository rather than process state.
- [Whitespace is accidentally normalized] -> Compare the complete file string including its final newline.
- [The proof is intentionally narrow] -> Treat it only as workflow plumbing evidence, not application or provider verification.

Failure modes are limited to a missing/unreadable marker or a byte mismatch; either condition fails the focused test with no recovery side effect.

## Migration Plan

Add the marker and test together. No deployment or rollback procedure applies; reverting those two files removes the implementation.
