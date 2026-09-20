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
- PR publication was blocked before any remote change: the connected GitHub
  write tool returned `MCP tool call requires approval, but approval policy is
  never`. No PR or remote branch was created. CI could not be started through a
  new PR. The implementation is saved as a local commit and a reviewable patch.
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

## Existing-demo replay, 20 September

Ran `scripts/replay-evidence-checklist.mjs` against the original SAC-246 plan,
eleven main-flow captures, three distinct response captures, and archived D1/R2
and cleanup receipts. No new implementation or application execution was needed.

The real runtime and publication functions retained all fourteen images with
matching SHA-256 hashes. Seven checklist items and sixteen published evidence
links were verified. Two deliberate negative cases (unfinished failure scenario
and lost earlier evidence link) were rejected before any output write. Repeated
publication reused the same output without additional writes. No unexpected
error occurred in this replay.

This is an offline real-artifact replay. The author checklist answers are replay
fixtures; GitHub writes use a local sink. It does not prove that a Cloudflare
agent follows the new instructions, nor that live GitHub publication succeeds.
See demo-replay-proof.md and demo-replay/report.json.

## Requested release, 20 September

Merged the provider retry work into the checklist branch locally without a
conflict. The combined source passed 43 focused regressions and TypeScript
checking. Published PRs 139, 140 and 141 each have passing GitHub CI but remain
open; the checklist and integration source have not run in GitHub CI.

GitHub branch creation was rejected again with the original diagnostic:
`MCP tool call requires approval, but approval policy is never`.
No remote mutation or deployment followed. This is a session policy block,
not a Cloudflare-agent failure. The user's release authorization is recorded;
repeating a permission question would not change the tool policy.

The main-to-integration whitespace check found formatting in archived raw
evidence only. The original check output was saved and the evidence retained.
See release-checkpoint.md for exact commits, validation and remaining steps.

## Session access diagnosis, 20 September

The user asked why `gh` had been replaced with the GitHub connector. A fresh
read-only `gh api repos/sachinkundu/deos --jq '.full_name'` failed with:

```text
error connecting to api.github.com
check your internet connection or https://githubstatus.com
```

The command runs `/opt/homebrew/bin/gh`. Its environment reports
`CODEX_SANDBOX=seatbelt` and `CODEX_SANDBOX_NETWORK_DISABLED=1`. Independent DNS
lookups for `api.github.com`, `github.com` and `api.cloudflare.com` all failed
with `gaierror(8, 'nodename nor servname provided, or not known')`. No proxy
environment variables are set. This confirms that the current shell cannot
resolve those providers while its sandbox network access is disabled; it does
not establish a GitHub service outage.

The saved user configuration has `approval_policy = "on-request"` and
`sandbox_mode = "workspace-write"`, with no explicit workspace network opt-in.
There is no repository `.codex/config.toml`, parent code-directory config,
`/etc/codex/config.toml` or `/etc/codex/requirements.toml` at the checked paths.
The active session nevertheless declares approval policy `never`, matching the
connector's rejection. The origin and timing of that session override remain
unknown. No permission setting was changed during diagnosis.

`gh auth status` also reported `The token in default is invalid.` Because its
provider connection is unavailable in this shell, this result is not sufficient
to establish token expiry or a remote authentication rejection. Recheck it after
normal network access is restored; credentials were not printed or changed.

`gh` remains the preferred release tool. The connector was a fallback with
working reads, not a planned change to the release process. Release work remains
blocked pending a session that allows the required network and write operations.
