# Mandatory independent demo gates

SAC-172 now requires a Claude demo plan before Codex implementation and a fresh Claude evidence review before implementation PR publication. The plan covers approved requirements. The gate gives a reason for each Pass, Needs work or Blocked result. It can return work to Codex. Portal nodes expose the saved requirements, verdicts and evidence.

The frozen-run upgrade uses an audited preflight and the existing compare-and-swap retry transaction. It preserves approved sources, the saved patch, branch and human binding. It enters Demo Plan.

Local checks: 524 backend tests, 101 portal tests, 72 Python tests and 109 BettaView tests passed. Backend and portal types, generated bindings, both app builds and strict OpenSpec validation passed. The built Linux runtime rejects author verification calls and capture replacement. Its supervisor sends the captured candidate directly to verification. The unchanged server validator still rejects stale or incomplete proof. This removes the nested Sandbox callback from verification; the exact stalled operation in SAC-182 try 11 was not proven.

The runtime fixture is a local process and isolation test with a stub broker and no model authentication. It is not provider-originated or Cloudflare end-to-end proof.

A separate private Cloudflare Sandbox probe demonstrated a quick tunnel initially returning HTTP 530/1016 and later the expected page. The preview readiness helper checks the same allocated relay, without calling the changed app. Allocation alone does not establish public readiness. Probe and cleanup receipts are attached separately.

Activation, the audited SAC-182 upgrade, live Claude jobs, staging browser checks and the complete SAC-182 canary remain separate acceptance steps. SAC-172 has no implementation PR until the full agreed canary passes.

Demo Plan and Demo Gate explicitly bypass reuse of prior planning and design reviews. A focused Sandbox controller regression verifies each role enters fresh allocation. The same demo attempt may still recover its own durable collection after interruption.
