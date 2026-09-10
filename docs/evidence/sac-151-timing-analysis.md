# SAC-151 preliminary timing analysis

Measured from live D1 on 2026-09-10. Historical SAC-148 review and repair artifacts were also read from R2 and verified against their manifest hashes. This compares elapsed workflow time, not isolated model inference time or container cold-start time.

## Current calculator canary: SAC-166, run 3

| Boundary | UTC | Elapsed from preceding boundary |
| --- | --- | --- |
| Author started | 07:31:06.661 | — |
| First candidate checkpoint | 07:47:19.249 | 16m 13s |
| Discovery result checkpoint | 07:52:18.147 | 4m 59s |
| Repaired candidate checkpoint | 07:55:00.427 | 2m 42s |
| Final recheck result checkpoint | 07:56:44.114 | 1m 44s |
| Author completed and collected | 08:03:25.885 | 6m 42s |

The first candidate to final recheck submission took 9m 25s. Submission is not durable acceptance. The final acceptance and collection were delayed by the artifact-manifest uniqueness defect and workflow step retries. Including that tail, first candidate to completed author took 16m 7s. Full author elapsed time was 32m 19s.

The first draft interval includes model work, validation/readability work, and any overlapping observation disruption. It must not be described as pure inference time. The last interval includes incident recovery and normal finishing/collection; it must not all be described as removable overhead.

Three fresh native child sessions ran in one author Sandbox: two discovery calls and one fixed-list recheck. The author performed one repair. All three proofs were accepted. Independent OpenRouter review, publication, human waiting, and the earlier failed canary runs are outside these planning-loop figures. Those failures still count against the overall trial experience.

## Historical separate-Sandbox loops

The closest example in the same sample project was SAC-148 (Google search summary CLI), workflow v17 on September 1. It used gpt-5.6-sol, one discovery stage, one author repair, and one fixed-list recheck. R2 confirms five findings, repair, and then pass. The current calculator has different content and findings, so this is not a controlled comparison.

| SAC-148 boundary | Elapsed |
| --- | --- |
| Initial author started to completed | 5m 24s |
| Initial author completed to final self-recheck completed | 17m 21s |
| Full author plus self-review loop | 22m 46s |

Across four uninterrupted, one-repair loops in v17-v22, the corresponding review/repair/recheck interval was 17m 21s, 17m 54s, 22m 39s, and 17m 22s. One additional one-repair run had an overnight gap and was excluded. Multi-repair runs were also excluded from that range. These are workflow elapsed measurements, not task-normalized benchmarks.

Thirty completed historical discovery, repair, and recheck attempts had a median 14.1 seconds between durable attempt creation and process start. This includes setup; it does not isolate Cloudflare cold starts. Avoiding three such starts saves roughly 42 seconds at that median, before accounting for new native hook overhead. Cold starts alone cannot explain a many-minute gain.

The old stages used five-minute completion observation intervals. Native initial authors now use ten-second intervals. The reduction in observation delay is therefore a separate contributor to the expected benefit. Historical transcript artifacts lack event timestamps, so exact idle time after model completion cannot be reconstructed from those artifacts.

## Interpretation

The 9m 25s interval to final native review submission is about 46-58% shorter than the four old completed-loop intervals. That is an encouraging direction, not a measured 46-58% production speedup: it excludes current acceptance/collection recovery and compares different tasks. Including the recovery tail, the current loop took 16m 7s, about 7% shorter than the closest sample-project loop, while full planning took 32m 19s versus 22m 46s.

The strongest supported conclusion is fewer Sandbox lifecycles and shorter internal review turnaround, with total planning speed still unproven. Model work, author familiarity with its current files, completion polling, hook/checkpoint overhead, findings, and incident recovery all affect the result. Reviewer context remains fresh and the review rules remain unchanged. Token or cost savings are not established by these timings.

The earlier calculator SAC-129 used an older combined openspec_planning stage, so its roughly ten-minute successful initial attempt is not a baseline for the current multi-stage review policy.
