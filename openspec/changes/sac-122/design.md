## Context

See `proposal.md` for motivation. The canary is a repository-only marker and test: it must remain deterministic, add no dependency or runtime behavior, and produce no deployment or release effect. The delta specification under `specs/sac-121-live-e2e-marker/spec.md` is the source of truth for observable requirements.

## Goals / Non-Goals

**Goals:**

- Represent the canary as one byte-stable repository file.
- Verify the file with the existing Node test runner using a raw-byte comparison.
- Keep implementation and terminal OpenSpec lifecycle actions independently auditable.

**Non-Goals:**

- Introduce a runtime component, external service, credential, or package.
- Exercise, deploy, release, or modify the deployed SAC-121 workflow.
- Automate provider-side state transitions or combine implementation with terminal spec sync and archive.

## Decisions

### Store the marker as a plain repository file

The implementation will add `canary/sac-121-pr46-e2e.txt` containing the UTF-8/ASCII byte sequence for `sac-121-pr46-live-e2e` followed by exactly one line-feed byte. A plain file makes the canary directly reviewable and avoids generation-time variability. Generating the marker during tests was rejected because it would test generated data rather than committed repository state.

### Compare buffers with the built-in Node test stack

A TypeScript test under `tests/` will read the marker without a text encoding and compare the resulting `Buffer` with `Buffer.from("sac-121-pr46-live-e2e\n", "utf8")` using strict deep equality. It will locate the repository file relative to the test module rather than the process working directory. This detects a missing or extra newline, carriage-return conversion, BOM insertion, and every other byte difference while fitting the existing `node --experimental-strip-types --test tests/*.test.ts` command. A decoded string comparison was rejected because decoding can obscure invalid or transformed bytes; adding a test dependency was rejected because Node's built-in assertions are sufficient.

### Keep lifecycle effects in their authorized workflow nodes

Implementation will only add the marker and its test and update the implementation task checklist. The terminal archive node will use native OpenSpec sync/archive behavior to merge the delta specification and move the change to `openspec/changes/archive/`. Publishing is limited to exactly one final GitHub work product for each agent attempt. Deployment and release commands are excluded. Combining these actions in a script was rejected because it would blur human gates and make provider effects harder to audit.

### Component diagram

```text
tests/sac-121-pr46-e2e.test.ts
              |
              | raw fs read
              v
canary/sac-121-pr46-e2e.txt ---- strict Buffer equality ---- expected bytes

openspec/changes/sac-122/specs/.../spec.md
              |
              | terminal native sync/archive only
              v
openspec/specs/.../spec.md + openspec/changes/archive/sac-122/
```

### Event flow

1. The implementation attempt commits the marker and deterministic Node test.
2. The repository test runner reads the committed marker as raw bytes.
3. Strict buffer equality passes only for the specified byte sequence; any difference fails the test.
4. Later workflow gates validate the implementation without deploying or releasing it.
5. Only at the authorized terminal node, OpenSpec syncs the delta spec and archives the change.
6. Each agent attempt publishes no more or less than its one required final GitHub work product.

### Minimal data model

| Record | Fields / invariant |
| --- | --- |
| Marker file | Path: `canary/sac-121-pr46-e2e.txt`; bytes: `73 61 63 2d 31 32 31 2d 70 72 34 36 2d 6c 69 76 65 2d 65 32 65 0a` |
| Test expectation | A `Buffer` constructed from the exact specified UTF-8 literal; equality is byte-for-byte |
| OpenSpec lifecycle | Active change `sac-122`; delta capability `sac-121-live-e2e-marker`; terminal state has the delta synced and the change archived |
| Attempt work product | Exactly one final GitHub work product associated with each agent attempt |

No application database or runtime schema changes are introduced.

## Risks / Trade-offs

- [Checkout or platform changes line endings] → Commit the exact LF-terminated bytes and assert the raw `Buffer`, so validation fails visibly.
- [Test execution starts outside the repository root] → Resolve the marker from `import.meta.url`, independent of the current working directory.
- [A lifecycle action occurs at the wrong gate] → Keep implementation, validation, publication, sync, and archive responsibilities explicit and use native OpenSpec commands only at their authorized nodes.
- [The marker test broadens the production test surface] → Use the existing built-in Node test runner and add no runtime code or dependency.

## Migration Plan

No deployment or runtime migration applies. Add the marker and test, run the repository and strict OpenSpec validations, and preserve the active change until the authorized terminal archive node. At that node, sync the delta specification to the main specifications and archive `sac-122` through native OpenSpec commands. Before archive, rollback is deletion of the two implementation files; after archive, rollback is a normal repository revert of the archive/sync commit.
