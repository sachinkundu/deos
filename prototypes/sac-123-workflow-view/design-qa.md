**Findings**

- No actionable P0, P1, or P2 findings remain.
- [P3] Alternate terminal edges are intentionally quiet but dense near `Stopped`.
  Location: lower-left workflow map.
  Evidence: the successful route stays solid green while four collapsed cancellation and failure paths use faint dashed lines into one terminal stage.
  Impact: the main route remains clear, but the alternate topology takes a moment to parse.
  Fix: keep this treatment for the first simple-workflow preview. Revisit edge bundling when the workflow grows.
- [P3] The open detail inspector covers the right-most workflow cards.
  Location: Human approval and Automatic merge & check while any detail is open.
  Evidence: the recorded-run browser pass required closing the current detail before selecting either right-most card; all details opened correctly after closing it.
  Impact: comparison works, but switching directly between right-side stages takes one extra action.
  Fix: consider resizing the graph around an open inspector when the workflow grows; do not change the approved layout in this evidence-only pass.

**Open Questions**

- None blocking. The UI groups ten version-4 definition nodes into six safe product stages. The presentation coverage test proves that every configured node and every distinct collapsed edge remains represented.

**Implementation Checklist**

- [x] Replace the legacy requirements-to-release fixture with the checked-in `simple` version-4 workflow.
- [x] Show Claim issue, Create planning PR, Human approval, Automatic merge & check, Completed, and Stopped.
- [x] Preserve the explicit Human approval to Create planning PR revision loop.
- [x] Make the Linear approval boundary explicit: moving the issue to Merging approves the plan; merge and verification then run automatically.
- [x] Show cycle counts only for stages with an explicit automated-review cycle and real cycle data. The simple workflow has none.
- [x] Describe the one planning-agent execution as `Run 1`, not `Cycle 1`; show no cycle copy for claim, human approval, merge, or outcomes.
- [x] Provide separate completed, in-progress, and failed issues for direct comparison from the issue rail.
- [x] Show the in-progress issue at Create planning PR with only Claim issue completed.
- [x] Show the failed issue on the observed Automatic merge & check to Stopped path; do not imply that Completed was reached.
- [x] Mark Completed as skipped when SAC-132 fails during automatic merge.
- [x] Add a rejected-at-Human-approval issue that highlights the normally dotted Human approval to Stopped branch.
- [x] Mark Automatic merge & check and Completed as skipped for the rejected issue.
- [x] Replace SAC-130 placeholder copy with the recorded Add Microsoft Entra login run, PR #1, real files, timings, validations, transcript summary, and terminal facts.
- [x] Preserve the missing historical governed work-link row as an evidence gap; reconcile PR #1 from the accepted result, Linear attachment, and GitHub read-back.
- [x] Enable the recorded SAC-130 Linear issue, PR #1, and immutable merged-file destinations; keep illustrative issues unlinked.
- [x] Preserve all collapsed cancellation and failure paths into Stopped.
- [x] Show the working SAC-130 provider-proof scenario as finished.
- [x] Show the planning agent, proposal/specification artifacts, and planning PR #59 in stage detail.
- [x] Keep System, Light, and Dark themes and provider-neutral copy.
- [x] Keep the primary path and alternate terminal paths visually distinct.

**Follow-up Polish**

- Consider bundled alternate-outcome routing when one workflow has enough steps that individual dashed terminal edges reduce readability.

**Evidence**

- Source visual truth: `design-source.png`
- Implementation screenshot: `implementation-simple-v4.png`
- Recorded SAC-130 screenshot: `implementation-sac130-recorded.png`
- Full-view comparison: `comparison-simple-v4.png`
- Viewport: 1728 x 1003 CSS pixels, density 1.
- Source pixels: 1484 x 1060. Implementation pixels: 1728 x 1003. The comparison uses `object-fit: contain` because the source and implementation have different aspect ratios and different workflow content.
- State: SAC-130, finished, Dark theme, Simple planning workflow definition v4.
- Focused comparison: separate source and implementation originals were opened at full resolution. A cropped region was not needed because this pass changes graph content rather than typography, controls, or detailed component anatomy.
- Primary interactions tested: open Planning detail; verify Planning Agent, `proposal.md`, `specs/.../spec.md`, and PR #59; open Stopped detail; verify the bounded cancellation/failure explanation; switch Light and Dark themes; close both inspectors.
- Browser console: a fresh final tab reported no errors or warnings.
- Recorded-run interactions tested: open Claim issue, Create planning PR, Human approval, Automatic merge & check, and Completed; verify the reconciled facts in each detail; open Planning Agent Run 1; verify the transcript outcome, counts, and recorded highlights.
- External destinations tested in the rendered prototype: the SAC-130 link resolved to the signed-in Linear issue and showed `Add Microsoft Entra login`; PR #1 resolved to the merged `SAC-130: OpenSpec plan` pull request; and `proposal.md` resolved to the immutable merge-commit file URL.

**Required Fidelity Surfaces**

- Fonts and typography: bundled Inter weights, title hierarchy, small metadata, state labels, edge label, and card copy remain consistent with the selected operator-view direction.
- Spacing and layout rhythm: the issue rail, status strip, legend, two-row workflow, card spacing, corner radii, and graph controls retain the selected proportions. The simpler six-stage graph uses the available canvas without stretching cards.
- Colors and visual tokens: the blue-charcoal background, blue product accent, green confirmed state, amber waiting state, and muted dashed future paths match the selected semantic palette.
- Image quality and asset fidelity: the interface uses the existing Phosphor icon set. No reference icon or visible image asset was replaced with improvised SVG, CSS art, emoji, or text glyphs.
- Copy and content: all visible workflow copy now describes the actual simple planning flow. It does not expose hosting or storage implementation terms.

**Comparison History**

- First rendered pass: the review return edge had no valid source handle, so it was absent and the console warned. The branch labels also overlapped the return label.
- Fix: added explicit top source and bottom target handles, routed the revision loop above the planning cards, and removed labels from the quiet terminal branches.
- Post-fix evidence: `implementation-simple-v4.png` shows the explicit `Revision requested` loop, solid green successful route, faint dashed alternate outcomes, and no overlapping labels. A fresh browser tab reported no console issues.
- Copy correction: renamed the `planning_review` human gate to `Human approval` and the following system-action stage to `Automatic merge & check`, so the Linear approval action is not confused with the automated merge.
- Sidebar correction: removed default cycle counts from every completed stage. Cycle copy now requires both an automated-review stage and reported cycle data; ordinary agent execution uses `Run`.
- State comparison: added explicit per-stage state maps for one finished, one in-progress, and one failed issue. The failed example records automatic merge as the failure source and highlights the observed path into Stopped.
- Branch comparison: added a stopped issue for a plan rejected at Human approval. The observed dotted branch is highlighted, while downstream successful-path cards use the distinct skipped treatment.
- Recorded-run pass: manually reconciled Linear state history, workflow telemetry, durable run and transition records, the accepted artifact manifest, agent transcript, and GitHub PR #1. The approved layout remained intact; stage facts and transcript content now use the recorded SAC-130 run.
- External-destination pass: replaced prototype-only destination modals with real new-tab links for SAC-130 and verified the exact Linear and GitHub URLs.

final result: passed
