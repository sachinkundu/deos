# Preserve demo evidence and check the checklist before publishing a PR

When an author added missing proof, the runner discarded the earlier screenshot
selection. The final PR could show only the correction and lose the main flow.
This change retains completed collections, keeps an evidence archive across
retries, and requires a reason to omit previously selected proof.

The author receives a structured checklist from the saved demo scenarios, with
status, evidence links and an explanation for each item. Before publishing the
PR, the workflow checks that all items are accounted for and their evidence will
be published. Agents still judge whether the evidence is sufficient; there is no
image quota or additional independent review round. The PR links the checklist.

Based on [the sandbox-browser PR #140](https://github.com/sachinkundu/deos/pull/140).
The approved SAC-246 proposal and design, application code and live runtime are
unchanged by this fix.

Validation: 20 focused regressions passed, followed by the final selection check
and TypeScript checking. The full local suite recorded 610 passes, one existing
skip, 12 local-port permission failures and two Node 26 native assertions.
[Executable local proof](local-regression.md) and [failure log](failures.md).
CI on Node 22 and a Cloudflare implementation-only canary remain pending.

The [earlier canary evidence](https://github.com/sachinkundu/deos-sample-project/pull/45#issuecomment-5727967312)
documents the incident, not validation of this fix. The next canary must show the
Cloudflare author retaining and publishing the complete evidence without a
supervisor supplement. Keep this PR draft until that proof is collected.
