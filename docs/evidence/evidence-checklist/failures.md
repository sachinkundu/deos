# Evidence checklist fix: failure log

20 September 2026. This log concerns preparation of the workflow fix, not a new
application canary. No sample application source was edited and no live runtime
was replaced.

## Fixed in this change

- **EC-01 — A correction erased the selected earlier gallery.** Starting a demo
  filtered out every browser image. Completed collections now accumulate, failed
  collections leave earlier work intact, and selection carries prior chosen
  evidence forward. An explicit omission requires a reason and keeps the original.
- **EC-02 — Missing final evidence accounting.** A scenario checklist now binds
  author claims to selected evidence. Publication checks its shape, scope and
  links before touching GitHub. Semantic sufficiency stays with the agents.
- **EC-03 — A killed supervisor saved code but omitted its evidence state.** The
  recovery snapshot now includes the archive, selection and checklist. Runtime
  state writes are atomic; older snapshots fall back to the prior candidate.
- **EC-04 — One existing test expected empty selection to erase chosen proof.**
  Updated it to require the new explicit omission and verify originals survive.

These are local workflow fixes by the supervisor, not Cloudflare-agent recovery.
The regression reproduces eleven main-flow images plus three corrective images.

## Environment limitations during validation

- Shell GitHub requests failed with `error connecting to api.github.com`.
  The connected GitHub service could read the exact PR and branch state.
- The edit tool rejected an isolated checkout outside the project. Work moved
  inside the allowed project directory; no broader permissions were requested.
- The isolated clone had no Git author identity. The first commit attempt failed
  without creating a commit. Reused the source checkout's existing repository
  identity in this clone only; global Git settings were unchanged.
- The local full suite on Node 26.7.0 reported 610 passes, 14 failures and one
  existing skip. Twelve failures report `listen EPERM: operation not permitted
  127.0.0.1` under the session's network restriction. Two test processes
  (`claude-tool-broker` and `implementation-progress`) aborted with Node's native
  assertion `(env_->execution_async_id()) == (0)`. Their exact relationship to the
  network restriction is unproven. CI uses Node 22; do not count this local run as
  a full-suite pass. Original output remains in the local validation log.

## Validation obtained

The focused evidence, demo, publication, recovery and task-guidance regressions
passed, as did TypeScript checking. See local-regression.md for executable
commands and captured results. Provider publication uses test adapters here;
this is not proof that the next cloud author follows the checklist.

## Still to verify

Run CI, then activate this workflow in the normal safe rollout and run the
implementation-only canary. The Cloudflare author must fill the checklist and
publish both evidence sets without a supervisor supplement. Existing frozen
workflow prompts do not upgrade automatically. No live deployment or canary was
performed during preparation of this fix.
