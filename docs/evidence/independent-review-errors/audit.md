# Independent review error audit

The status reader could miss a failure file published between its first file check
and process exit. Cleanup then deleted the only copy. The regression test forces
that ordering and checks the original message and cause in D1 and R2.

| Boundary | Correction |
| --- | --- |
| Claude status polling | Read terminal files again after observing process exit. Repeated failed-status reads return the original error reference. |
| Claude invocation failure | Verify R2 evidence and write its D1 reference before setting failure state. Storage failures retain both causes. |
| Claude cleanup | Keep the runner alive until evidence is saved. Stop and drain the process, collect terminal files, then destroy it. Failed capture can be retried. Cleanup and state-write failures retain their causes. |
| Claude request publication | Preserve rename output, exit code and timeout flags. |
| Claude HTTP adapter | Preserve response body, status, operation and original error reference. Retry transient status reads up to three requests; never replay an ambiguous provider turn. |
| Trusted Claude process | Write the full failure to stderr as well as the terminal file. Preserve provider events and errors during drain and cleanup. |
| Claude result validation | Keep provider auth/quota events, invalid response text, terminal evidence and configuration failure causes. |
| Planning/design subprocesses | Wait for close so both pipes drain. Preserve stdout, stderr, exit code, signal, command and cause. |
| Planning/design temporary files | Keep the primary error if temporary-file cleanup or native request saving also fails. |
| BettaView review helper | Retain full output instead of only a tail. Preserve retry errors and wrapping causes; update the maintained copy and bundle hash together. |
| OpenRouter transport retries | Record every original failed request, including failures followed by a successful retry. |

Expected absence checks and validated proof-repair loops remain. They either
handle a named recoverable condition or already record the original exception.
The existing safe public categories remain; they now link to complete evidence.

## Evidence boundaries

The Showboat record reads the original SAC-172 failure directly from live D1/R2.
The built-image check runs a real process locally with networking disabled.
Regression tests exercise races, HTTP failures, retries, diagnostic storage and
cleanup faults. These checks do not prove that an updated production reviewer
has reached the provider. This PR does not deploy, retry SAC-172, or cross its
human review gate.

SAC-172's trusted runner exited at 10:17:33.855 UTC and its sandbox was destroyed
at 10:17:54.770 UTC on 2026-09-13, according to retained process/container logs.
The saved error has exit code 1 and empty output. The error-loss race is
reproduced, but the original provider message for that historical invocation
has not been recovered. An offline run of the old deployed image reached its
provider wait and timed out, so it did not establish SAC-172's provider cause.
