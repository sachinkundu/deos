# Checked hosted preview for the calculator canary

## Current outcome at 03:58 UTC, September 16

The maintainer preview is deployed at
<https://11fa3ef4.sac-225-calculator.pages.dev>. Cloudflare reports deployment
`11fa3ef4-fb4e-422e-93d7-3da6de660c9d` successful on preview branch
`review-sac-225`. DEOS independently read that provider deployment and checked
the exact bytes and SHA-256 of all three served assets. Registration returned
HTTP 200 and saved an immutable D1/R2 receipt. See
`sac-225-pages-deployment.json` and `sac-225-hosted-preview-receipt.json`.

The user explicitly authorized the existing broader operator token for this
canary. It was installed only in the trusted Worker and used by the maintainer
deployment process. It was not supplied to the coding agent or CI. A separate
Pages token is a later configuration improvement, not a remaining blocker.

The first real registration exposed an unsupported Workers fetch option:
`redirect: error`. The original error is retained under workflow error
`d2a5de61-8ef9-4c3e-a33a-cd50dd7e19d8`. Source `8dd41e5` uses manual redirects
and rejects any redirect before parsing the provider response. Regression
coverage includes the Workers option restriction and a non-JSON API redirect.
All 564 backend tests, TypeScript, and the Worker dry run passed after this fix.

Backend version `0bd315ca-6f82-4450-ab15-422fdb031240` is active at 100%.
All four container pools were healthy 4/4 at read-back, with the same container
image. The deployment used `--containers-rollout none`. Global active attempts
were zero immediately before secret activation, Pages deployment, backend
deployment, and the subsequent workflow retry. The portal was not redeployed.

A fresh audited correction preflight preserved the approved input, base, patch,
branch, and human binding. Its execution established the retry at visit 37 on
definition 31, digest
`177e21cdfdb99ebba377670e98c5837609f7a2f33655124e107fe12094d3b98c`.
D1 shows the independent demo-plan attempt running. The correction permits
revision only of scenario `sac-225-demo-14`; it does not grant a demo pass.
The old Workflow instance was absent during replacement; its original
`instance.not_found` diagnostic was retained, and the replacement was created
successfully. See the correction preflight and retry JSON alongside this file.

A manual Codex Browser smoke check on the actual hosted URL showed `2 + 3 = 5`.
This is operator verification, not autonomous author or Demo Gate proof. Fresh
workflow evidence, independent demo approval, and the final implementation PR
remain outstanding. SAC-182 stays stopped and SAC-226 stays in Backlog.

The sections below retain the earlier preparation and deployment record.

The saved calculator implementation was restored at its approved base. Its Git
tree exactly matches `8eb184220d08673abb7564089d72420f2dd54eb5`.
An isolated, credential-free Linux build passed 24 unit tests, 16 desktop and
320-pixel browser tests, and the production build. Three exported assets and
their hashes are recorded in
`/tmp/sac225-maintainer-preview/assets-manifest.json`. This is local validation,
not a Pages deployment or a completed canary.

The new operator endpoint `/implementation-hosted-previews` accepts an already
deployed static preview for a stopped run. It verifies the saved candidate and
build subject, reads the exact successful Pages preview deployment, and hashes
the served assets. Its immutable D1/R2 receipt is supplied to the author and
demo reviewers. It neither changes workflow state nor counts as demo evidence.

The existing browser can use `target: "hosted"` after local preview setup. It
keeps one session and a fixed pair of origins. Switching targets requires
navigation and a new HTTP result. Hosted access rejects a different code tree.
Screenshot receipts retain origin identity even when their bytes are equal.
Verification rejects changed proof captions, kinds, paths or sanitization, and
Demo Gate reads the service's saved provenance.

## Validation

- 564 backend tests passed, including real SQLite migration/immutability checks,
  provider/asset contract fixtures, stopped-run races, stale subjects, redirects,
  wrong identities, one-browser origin binding, and screenshot provenance.
- 102 portal tests passed.
- Backend and portal TypeScript passed.
- Generated Worker bindings and strict SAC-172 OpenSpec validation passed.
- The Worker deployment dry run passed.
- One new test initially failed because its fixture omitted approved requirements.
  The fixture was corrected; the full suite then passed.

The provider responses in these contract tests are fixtures. They are not real
Pages deployment proof. No remote preview has been registered by these tests.
Logs are `/tmp/sac225-hosted-preview-tests.log`,
`/tmp/sac225-hosted-preview-portal-tests.log`, and
`/tmp/sac225-hosted-preview-dry-run.log`.

## Activation and remaining proof

Apply additive migration 0047 before activating the Worker. Set optional Worker
secret `IMPLEMENTATION_PAGES_READ_TOKEN` from the separately scoped Pages token;
do not expose it to the author. The user was asked to save that token as
`CLOUDFLARE_PAGES_API_TOKEN` in the ignored main checkout `.env`. It was still
absent at the final local validation check.

Use the approved maintainer Pages deployment command for project
`sac-225-calculator`, branch `review-sac-225`. Read back its actual deployment ID
and immutable URL, then submit the asset manifest and current saved candidate
identity through the protected endpoint. The build tree and build-log digest
are a maintainer attestation; the service independently checks the Pages
identity and served bytes. Registration does not claim the build was autonomous.

Only after this path is active and checked should the operator redo and execute
the audited demo-plan correction preflight. A fresh author must capture hosted
browser proof, and the independent Demo Gate must pass before the final PR.
The Pages credential, actual deployment, registration and canary proof remain
outstanding. SAC-182 remains stopped; SAC-226 remains in Backlog.

Provider contract:
[Pages deployment read-back](https://developers.cloudflare.com/api/resources/pages/subresources/projects/subresources/deployments/methods/get/).

## Deployed read-back

Source `e6e63e7` is pushed. Migration 0047 was applied and its table and immutable
trigger were read back from D1. Backend version
`7c2910da-b0e2-4851-af1b-1177513577c4` activated at
2026-09-16T00:10:59.5057Z and was read back at 100% traffic. Global active attempts
were zero immediately before activation. No container image changed, and no
portal or BettaView deployment was performed.

At 00:13:10 UTC, both implementation pools and the Basic pool were healthy 4/4.
The shared Standard-2 pool reported one healthy and three starting instances,
with no health errors or failed instances. The readiness check correctly stayed
false; do not claim all pools are ready or restart the canary from this snapshot.

The new route returns 405 for GET and 401 for an unauthenticated POST, without
changing a run. An initial Python-default-user-agent probe received Cloudflare
403 / code 1010 before reaching the Worker. Using the existing `deos-operator/1.0`
client user agent reached the route and confirmed its method and authorization
checks. This is route validation, not successful preview registration.

D1 still shows SAC-225 failed at visit 36 on definition 30, its saved tree and
base unchanged, zero registered hosted previews and no implementation PR.
The saved registration template uses the current D1 candidate digest
`0ee4ac484c25226c1b35209a96cea27a2aa1e5867fd0f2cf046b9028502faf8e`;
the separately restored failed-attempt artifact has different metadata but the
same checked code tree. An actual deployment ID is still required.

Executable read-back is in `sac-225-hosted-preview-showboat.md`. The corresponding
activation, D1 state and route-check JSON files are alongside this document.

## Ready read-back

At 2026-09-16T00:19:26.712487Z, all four pools were healthy 4/4 with no
starting or failed instances and no health errors. Shared Standard-2 is now
version 23; all pools retain the expected image. Backend activation remains
100% on the expected version. The read-back readiness check is now true.
See `sac-225-hosted-preview-ready.json`. The separately requested Pages token
is still absent; no preview deployment, registration or canary retry occurred.
