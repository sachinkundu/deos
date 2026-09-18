# SAC-246 implementation repeat: interim analysis

The repeat is intended to test the replacement browser and implementation gates.
Do not count earlier SAC-246 attempts as new failures. Use new attempt IDs and the
start receipt. The approved proposal, design and demo plan remain unchanged.

## Automatically recovered

The first combined check failed on a local test-adapter message assertion. The
cloud author reran the affected test and full16test suite unchanged; both passed.
The build passed too. The underlying intermittent adapter cause is unresolved. A progress notification timeout and invalid task transition
were also observed. They have not stopped the attempt. These are provisional
observations; see LOCAL-01..06 in failures.md. The first remote publish health
check returned1042 and then recovered on the author retry using the same owned
environment. An invalid R2list prefix was removed and the request succeeded. An expanded demo
request exceeded1MiB before dispatch; the agent reduced its bodies and the
replacement collection is in progress. Normal image upload and
gradual rollout are expected asynchronous operations, not recoveries. Provider
retries of the superseded oversized image did not fix its packaging defect.

## Fixed by the supervisor

The supervisor changed workflow/runtime code only. The local browser regression
found an unsafe redirect behavior and the driver now checks each hop before a
request is sent. The supervisor also added browser-runtime review identity so the
previous external-browser review cannot replace a fresh independent gate.

The first cloud deployment exposed image disk pressure in the basic pools. The
supervisor removed the unused headed browser and package caches; the resulting
image passed the real Chromium regression at1GiB memory. Full activation is recorded in activation-complete.json. Test-authoring mistakes are listed separately in failures.md.

The existing cloud workflow engine retained yesterday's code. Its1197step history
was archived and only the engine restarted. D1 and the new provider history prove
that it resumed implementation review visit50, without earlier agent stages.
This is deliberate supervisor activation, not cloud-agent self-recovery.

## Still requires verification

Cloud-agent loopback and owned remote HTTPS captures now exist, and remote D1/R2
readback matches browser-created data. The loopback capture shows an explicitly
uninitialized local-store error state; it proves rendering, not local storage.
The new independent review and any routed author response, durable PR publication,
and resource cleanup remain pending. The revision reached implementation_build visit51
on18September07:51:51 with the original approved hashes; see canary-start.json. Preserve honest distinctions between local Linux
regression, cloud runtime activation and the full implementation canary.

The prior run's unrelated stderr preservation, reviewer provenance, delayed gate
wake, provider resets and portal rendering questions are still open unless this
repeat provides new evidence. Replacing the browser removes the relay from the
new local path; it does not repair the old relay service.

## Comparison with prior runs

The first SAC-246 run reached PR45 with supervisor assistance. Its final demo used
the remote Worker because local relay530/1016 remained unresolved. This repeat
must demonstrate the local path directly and verify real remote storage too.

Image disk pressure is a newly exposed deployment cause from adding Chromium.
Frozen engine activation repeats a known operator boundary from earlier canaries.
Neither is evidence that the trial application's implementation regressed. Compare
run error counts only after full new transcripts and cleanup have been audited.

Prior baseline: ../sac-172/storage-canary/analysis.md and failures.md. New detailed
register: failures.md. This is an interim report, not a completed canary result.
