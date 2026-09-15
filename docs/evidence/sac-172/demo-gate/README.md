# Mandatory independent demo gates

SAC-172 now requires a Claude demo plan before Codex implementation and a fresh Claude evidence review before implementation PR publication. The plan covers approved requirements. The gate gives a reason for each Pass, Needs work or Blocked result. It can return work to Codex. Portal nodes expose the saved requirements, verdicts and evidence.

The frozen-run upgrade uses an audited preflight and the existing compare-and-swap retry transaction. It preserves approved sources, the saved patch, branch and human binding. It enters Demo Plan.

Local checks: 529 backend tests, 101 portal tests, 72 Python tests and 109 BettaView tests passed. Backend and portal types, generated bindings, both app builds and strict OpenSpec validation passed. The built Linux runtime rejects author verification calls and capture replacement. Its supervisor sends the captured candidate directly to verification. The unchanged server validator still rejects stale or incomplete proof. This removes the nested Sandbox callback from verification; the exact stalled operation in SAC-182 try 11 was not proven.

The runtime fixture is a local process and isolation test with a stub broker and no model authentication. It is not provider-originated or Cloudflare end-to-end proof.

A separate private Cloudflare Sandbox probe demonstrated a quick tunnel initially returning HTTP 530/1016 and later the expected page. The preview readiness helper checks the same allocated relay, without calling the changed app. Allocation alone does not establish public readiness. Probe and cleanup receipts are attached separately.

Activation, live Claude jobs, staging browser checks and the complete canary remain separate acceptance steps. The user replaced the large SAC-182 canary with SAC-225, a simple web calculator in deos-sample-project. SAC-172 has no implementation PR until the full agreed canary passes.

Demo Plan and Demo Gate explicitly bypass reuse of prior planning and design reviews. A focused Sandbox controller regression verifies each role enters fresh allocation. The same demo attempt may still recover its own durable collection after interruption.

The backend Worker was activated at 100% on version `62ca6f1f-db51-4048-b0e6-9294e2b86682`. Staging portal version `63782ae2-7a2c-42f7-ba45-4e571ab2dfe4` is at 100%; Wrangler reported a route-list permission error after upload, so activation was read directly from the Cloudflare API. The canary uses healthy fully rolled out Standard-2 implementation and Claude pools with image `sha256:cd1bdeac39239006acc1fe0a6b92051c98cc5b7e70a1556667340157d31a1877`. The generic relay pool also completed. The unused basic implementation pool was still rolling out in the attached activation snapshot.

SAC-182 was moved through the audited operator path from frozen version 27, failed visit 57, to version 29, Demo Plan visit 58, at 13:51 UTC. Its old Workflow is errored. The replacement was established as queued. This is an audited recovery, not a synthetic provider approval. The saved patch, base, branch, human identity and Standard-2 recovery remain preserved. The Demo Plan attempt then failed because the shared snapshot reader did not allow the frozen demo source paths. Both Sandboxes were destroyed. The run is failed at visit 59 and remains stopped at the user's request.

The reader now accepts only the frozen demo source inventory and still rejects unlisted paths, traversal and hash mismatches. A child-process regression exercises approved files, candidate code and context. Migration 0046 extends the existing audited stage retry to both demo roles and preserves existing retry rows, tiers, foreign keys and tier guards. Full backend and portal tests and types pass.

SAC-225 was created in Backlog on 2026-09-15 at 14:04 UTC. For this canary only, the user authorized automatic proposal/specification and design approvals after checks pass. The implementation PR remains the human review stop. Creation is not evidence that the workflow has started.

Calculator setup found a stale email-equality check in route enablement. The approved design binds a selected, provider-checked Linear user ID to the Access identity; the two email addresses may differ. Enablement now rechecks the exact active, non-bot user ID and the saved Access binding. The regression accepts different provider email addresses but rejects a changed user, inactive account, bot or different Access identity.
