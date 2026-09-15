# SAC-172 verification repair loop

*2026-09-15T06:53:44Z by Showboat 0.6.1*
<!-- showboat-id: df97e706-2e11-4f6c-9698-7fba407fc6fe -->

The supervisor now checks the captured candidate while the implementation session,
tool server, preview and heartbeat remain alive. A repairable rejection returns
its exact reason to the same Codex session through a saved prompt file. It does
not allocate another attempt or change the workflow graph. The original attempt
deadline still applies. A real human blocker follows the existing clarification
gate. Identity, integrity, authorization and storage faults retain their failure
paths and original errors.

The broker and final collection use the same validator. Only current-tree checks
and proof can pass. The latest result for the same command and working directory
supersedes the earlier result; the diagnostic journal retains the full history.
Earlier setup and exploratory commands are not promoted into a new permanent test
inventory. The agent still must run the checks required by the approved tasks.
The accepted candidate and patch remain paired through finalization.

The final repository suite passed **497 tests**, with type checking, generated
Worker binding checks, strict OpenSpec validation and the linux/amd64 image build.
The executable regression transcript follows below. It was repeated after removing
an overstrict rule that would have made every earlier command a permanent test.

[Container process proof](verification-repair-container.json) exercised the actual
built supervisor, tool server, shell commands and Showboat. A deterministic model
fixture first returned a failed check, then edited code after a passing check,
then reran checks and captured fresh proof. The supervisor used one initial process
and two `exec resume` processes with the same session ID. It retained four check
records, matched the final patch hash, kept heartbeats alive during a 32-second
verification wait, and emitted one completion signal. The fixture model and
capability transport were local substitutes; this is not live model or provider
end-to-end proof. Reproduce with `scripts/sac-172/verification-repair-proof.mjs`
inside the built image, mounting this repository read-only at `/proof-src`.

[Canary evidence](verification-repair-canary.json) records the separate interruption
of SAC-182 try 7 before this code was deployed. Its last heartbeat was at 06:31:48Z.
The last transcript showed a BettaView Vite build. The cause of the heartbeat loss
is not established. Python checks also failed because the sandbox supplied Python
3.10 while this repository requires at least 3.11. The 161138-byte recovery patch
was hash-checked and applied to a private Git index, reproducing the exact saved
tree. No human gate was changed, and this repair did not start another canary try.
Full changed-application proof and the implementation PR remain pending.

```bash
rtk proxy node --experimental-strip-types --test tests/implementation-verification.test.ts tests/implementation-git-runtime.test.ts

```

```output
✔ trusted snapshot uses the actual Git tree, includes binary bytes, and refuses symlinks (521.967375ms)
✔ atomic ref write speaks the real Git protocol and rejects a raced prior head (332.759084ms)
✔ local preview config cannot carry remote bindings, secrets or another try persistence (0.654417ms)
✔ check acceptance is tied to the exact final tree and base (0.467ms)
✔ trusted output reads refuse symlink and cross-directory targets (2.622791ms)
✔ latest result replaces the same command in the same folder and keeps other folders (0.218541ms)
✔ real worktree repair resumes one session until failed tests, stale checks and proof pass the shared gate (1821.310667ms)
✔ repair classification never turns infrastructure, identity or integrity errors into author feedback (0.236417ms)
✔ deadline, explicit failed result and unexpected faults cannot silently continue or pass (1.822292ms)
ℹ tests 9
ℹ suites 0
ℹ pass 9
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1950.47975
```

```bash
rtk proxy node --experimental-strip-types --test tests/implementation-verification.test.ts tests/implementation-git-runtime.test.ts

```

```output
✔ trusted snapshot uses the actual Git tree, includes binary bytes, and refuses symlinks (543.096708ms)
✔ atomic ref write speaks the real Git protocol and rejects a raced prior head (319.570125ms)
✔ local preview config cannot carry remote bindings, secrets or another try persistence (0.652875ms)
✔ check acceptance is tied to the exact final tree and base (0.5245ms)
✔ trusted output reads refuse symlink and cross-directory targets (2.69975ms)
✔ latest result replaces the same command in the same folder and keeps other folders (0.280709ms)
✔ real worktree repair resumes one session until failed tests, stale checks and proof pass the shared gate (1615.968166ms)
✔ repair classification never turns infrastructure, identity or integrity errors into author feedback (0.229416ms)
✔ deadline, explicit failed result and unexpected faults cannot silently continue or pass (1.6225ms)
ℹ tests 9
ℹ suites 0
ℹ pass 9
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1759.254708
```

Final activation: backend `d38a6614-07a2-46cb-8872-0af5190fa078` at 100 percent; both implementation container tiers at version 7, target image `sha256:75b30bd96b76b119663c773ab1076869543f72ff81dd71ffc29cf493df236594`, four healthy instances each. See [durable read-back](verification-repair-deployment.json).
