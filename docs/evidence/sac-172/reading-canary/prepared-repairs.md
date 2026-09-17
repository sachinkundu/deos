# Prepared reading-canary workflow repairs

Prepared on 17 September 2026 after the SAC-245 analysis. This patch changes the
DEOS workflow and its agent guidance. It does not change the sample app, approve
its PR, deploy the patch, or launch another canary.

## Fixes in this patch

| Finding | Prepared correction | Validation boundary |
| --- | --- | --- |
| READ-11: bulk checklist update | A `task` operation updates one existing checkbox, or reports it active, under author permissions. Each transition records its actual count, hash and timestamp in the collected diagnostic journal. Status exposes the latest task. Duplicate completion is idempotent and a task can be reopened. | Real temporary-file tests verify 0 → 1 → 2, retry, reopen, fenced examples, invalid/ambiguous IDs and symlink rejection. The existing watcher and portal still project the actual file. Cloud-agent adoption and observed portal latency require the next canary; fast legitimate completions can still coalesce between polls. |
| READ-08, 13–16: unnecessary local preview path | Assets-only preview uses the existing hosted publisher when authorized by the frozen policy. Worker entrypoints, D1/R2 bindings and explicit local requests retain local workerd. Browser/demo defaults follow that selected target; explicit targets remain respected. Status includes the current preview or saved hosted receipt. | Routing tests cover static, backend, explicit overrides and local D1/R2 isolation. No relay-provider fix is claimed. The next backend canary will deliberately exercise the local/backend path rather than bypass it. |
| READ-15: errors hidden by later shell commands | Direct bash/sh checks get fail-fast behavior; bash pipelines retain failures. Recent tool errors remain visible in status/diagnostics even when an outer native shell ends successfully. CLI/skill instructions preserve primary exit codes and direct agents to supported diagnostics. | Real child-process tests show an inner failure and a failed pipeline cannot be hidden by echo; explicitly handled failures remain allowed. Arbitrary native scripts can still intentionally mask exits, so retained tool errors and their audit remain necessary. |
| READ-18: stale cleanup metadata | Normal cleanup and scheduled/operator cleanup share the local-data receipt writer. Scheduled/operator cleanup first reconciles browser/provider resources, then destroys the sandbox, then writes local-data and attempt completion. A scoped reconciliation repairs old local-data rows only where a terminal attempt already records sandbox destruction. | Delayed browser-absence tests, hook-order tests and real SQLite tests verify idempotence, ownership and exclusion of active attempts and browser/provider rows. No production rows were manually changed. |
| Proof selection gaps | Status and selection responses group captures by scenario and show which images were omitted. The author receives instructions to retain useful before/after states. Demo planning now correctly describes measurements as diagnostic evidence and not an ordered demo step or mandatory PR item. | Tests retain original evidence, show omitted scenarios, permit an empty editorial selection, and add no proof-quality gate. Good image selection still requires agent judgment. |
| READ-06: progress notification timeouts | Keep the existing timeout and retry policy. Add private delivery timing, attempt/outcome, consecutive-failure and last-success observations; expose them through status/diagnostics and save the final observation in the existing journal. | Real HTTP/file-watcher tests cover lost connections, timeout recovery and revoked credentials. Original errors remain recorded. No claim that a network timeout is eliminated or that a notification ACK means the portal rendered it. |
| READ-07: premature status lookup | Unknown-operation guidance directs the author to await submission or resend identical input under the same ID. Help separates submission acknowledgement from completion. | Existing duplicate-submission/recovery tests still apply. This is tool guidance, not proof that an agent will never invent a new ID. |
| READ-01–05: inventory/heading assumptions | Explicit design headings now match the existing deterministic format check. Runtime guidance distinguishes an optional no-match from a real IO error and explains that slash-command names are not installed executables. | Existing design-format checks remain; no new quality rule. No-match searches stay visible rather than being silently swallowed. |
| Preview freshness wording | A different tree is described as an earlier repository snapshot that may differ in checklist or source edits. | This avoids asserting stale app code from a task-only edit. It does not falsely certify equal assets; receipt hashes and reviewer inspection remain the evidence. |

## What is not fixed by this patch

The provider causes of local relay 530/1016, hosted asset 522, connection resets,
and transient notification timeouts remain unknown. Avoiding unnecessary tunnel
allocation and retaining useful diagnostics reduce avoidable work; they do not
establish a provider root-cause repair. Browser close still waits for confirmed
absence. No silent retry of an uncertain browser action was added.

Per-task reporting is an author-facing capability and instruction, not a new
gate that evaluates completion. No fake intermediate counts are generated.
The one-Claude-review/one-author-response flow remains unchanged.

## Validation and local failure record

- The initial focused set passed all 35 tests, including real files, child
  processes, HTTP retry behavior and SQLite cleanup transitions.
- The first full suite ran 609 tests: 607 passed, one failed, one skipped.
  The failure expected the capability description to retain the words
  `Cloudflare Pages`; the edited prose said only `Pages`. The provider name was
  restored without weakening the assertion. The original output is retained in
  `repairs-full-first.log`.
- Final suite and typecheck results are recorded in `repairs-validation.json`
  and the adjacent logs. These are local regression checks, not a new cloud
  canary or proof of activation.
- Local preparation also hit a rejected multi-file patch due to an import
  quote mismatch; no partial file edits were applied. Some source searches
  named absent guessed paths. These operator-only errors had no cloud effect.

## Before deployment and another canary

Read authoritative D1 for all active attempts and use a stopped gate. Deploy the
Worker and container change, then verify the expected Worker at 100% traffic and
the expected image on healthy pools. Do not interrupt another author to activate
these repairs. Frozen runs keep their own workflow policy.

The [next canary brief](next-storage-canary.md) proposes a small D1/R2 app. The
current local D1/R2 bindings are emulated inside the isolated cloud sandbox;
the persistent hosted publisher serves static assets only. A real remote-storage
canary therefore needs the narrow temporary-environment capability described in
that brief before launch. The user's clarified lifecycle is to provision remote
storage for testing, publish the PR and durable screenshots/evidence, then delete
the temporary app infrastructure. A persistent review deployment is not required.
It must not be silently downgraded to browser storage or local emulation.

## Provider references checked

- [Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/)
- [D1 local development](https://developers.cloudflare.com/d1/best-practices/local-development/)
- [R2 Workers bindings](https://developers.cloudflare.com/r2/api/workers/workers-api-usage/)
- Current published Workers types `5.20260917.1` were retrieved and the D1
  prepared-statement API checked. The repository's pinned dependencies and
  compatibility dates were not changed for these repairs.
