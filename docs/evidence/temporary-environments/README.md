# Temporary environment validation

The extension adds a trusted temporary Worker/D1/R2 tool to DEOS. It is on
`codex/temporary-cloudflare-environments`, based on merged baseline PR #138.

Validated before rollout:

- 614 backend tests: 613 passed, one skipped. Typecheck and runtime syntax passed.
- The Linux container image built and the backend deployment dry run passed.
- A real Cloudflare Worker used a newly created D1 database and R2 bucket. The
  probe asserted insert/read/delete in D1 and put/get/delete in R2. Readback
  confirmed the served bundle, one version at 100%, and all resources absent
  after cleanup. [Executable proof](provider-proof.md), [receipts](provider-lifecycle.json).
- Failure tests cover lost creation/upload replies, cross-run access, credential
  redaction, ambiguous allocation quarantine, atomic migration rollback,
  protected control routes and remote screenshot routing.
- Production D1 preflight showed no active attempts and only migration 0053
  pending. Version 40 was already frozen for an existing provider-test profile;
  this extension uses version 41.

The adapter probe is not the cloud-agent canary. Agent use, screenshots, cloud
review, PR publication, and automatic post-publication cleanup still need that
run. Keep the [failure log](failures.md) current throughout rollout and canary.
