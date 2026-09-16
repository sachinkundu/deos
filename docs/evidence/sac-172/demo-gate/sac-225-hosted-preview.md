# Checked hosted preview for the calculator canary

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
