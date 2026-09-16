# Canary lessons rollout — 16 September 2026

Runtime commit: `d994b64`. The later documentation commit records the rollout and
the user's external-browser rule. No calculator or DEOS implementation PR was merged.

## Changes

The [maintained contract](../../../implementation-canary-lessons.md) and SAC-172
planning artifacts now reflect Claude-selected demo scope, one review and one
Sol response, durable accepted clarifications, continuation from saved work,
ordered scenario capture, clean PR proof and the runtime guide shipped in the
container. The new trusted static publisher supplies durable review URLs.
SAC-226's delivery handoff gap now uses an atomic D1 outbox and leased replay.
Capacity fallback remains the separate deferred SAC-235 task.

## Validation

- `npm test`: 565 passed.
- `npm run portal:test`: 103 passed.
- `uv run --extra dev pytest -q`: 76 passed.
- Backend and portal TypeScript checks, generated bindings, portal build and
  portal session-isolation check passed.
- Python Ruff, focused strict Pyright for the new outbox module and tests,
  strict SAC-172 OpenSpec validation and runtime skill validation passed.
- Backend and Python Worker deployment dry runs passed. The Linux image built.
  Its real Codex app-server discovered the enabled implementation skill. The
  author could read the guide, captured static files as the unprivileged user,
  received the CA environment, and could not export a symlink.

Whole-repository strict Pyright was also tried. It reports broad untyped Worker
and older test-module errors and is not passing; this is separate from the CI
Python checks and the passing focused check above. No claim of a clean whole-repo
Pyright run is made.

## Real provider checks

The actual preview publisher created a run-owned Pages project and uploaded a
small static fixture. Both served assets matched the saved bytes. The immutable
deployment and stable review alias worked, and replay returned the same receipt.
The browser button changed from zero to one after a click. This is an adapter
probe using local store fixtures and real Pages, not a complete workflow canary.
See [the provider receipt](static-preview.json).

Pages initially reported deployment success before the new hostname completed
HTTPS setup. Publication now retains that deployment and original failure and
asks for another read-back of the same request. It does not rebuild or blindly
create another deployment.

For real Linear ingress, SAC-225's priority was changed from none to low and then
restored. Its Human Review state and PR were unchanged. Linear emitted two actual
deliveries. Both were durably saved, sent once and processed by the workflow inbox;
neither created a human-gate decision. No handoff errors were stored. See
[delivery and route read-back](provider-handoff.json) and [inbox read-back](inbox.json).
Cancellation, failed send, ambiguous success and concurrent dispatch were tested
locally; no live Queue outage was injected. A synthetic signed probe was not sent
because its signing secret was not available locally.

## Activation

Cloudflare read-back confirmed one active version at 100% traffic for each Worker:

| Surface | Version |
| --- | --- |
| Workflow backend | `d75fabc7-2cf6-41c2-a970-df7f279084f5` |
| Linear ingress | `cf41c86e-e6e3-4324-b7b0-202460aec79d` |
| Staging portal | `85b21832-f3d7-439f-8b5d-e48004db41ae` |

All four container pools completed rollout to
`sha256:5706a5c803206827042b9c82779c56c2898916aa474dc6ae90ed6b019c015a68`,
with four healthy instances each and no failed or starting instances in the final
[activation read-back](activation.json). Migrations 0051 and 0052 were applied.

The staging deploy command uploaded the Worker, then failed its zone route-list
read due to token permissions. Direct deployment read-back confirmed activation
at 100%, and the unchanged custom-domain route served the new portal in Brave.
No permissions or routes were broadened to bypass that CLI error.

Through the authenticated external Brave session, the sample-project route was
set to implementation v39 and enabled at route revision 27. Existing runs retain
their frozen setup. The DEOS feature project's route was not changed.

## SAC-182 preservation

The authenticated activation-only migration moved SAC-182 from definition v29
to v40. The saved implementation row was byte-for-byte equal before and after;
the PR head and open state were also unchanged. Only the run's definition version
and digest changed among the compared authority fields. It remains failed at
visit 59 with no active attempt. The portal displays v40 and the original stopped
state. See [the migration response](sac-182-migration.json).

Calculator PR33 remains open for human review. The next canary has not started.
The rollout is not a claim of unattended delivery: the next small web app must
still reach its implementation PR with correct proof, and any supervisor action
must be recorded and turned into a general platform fix.
