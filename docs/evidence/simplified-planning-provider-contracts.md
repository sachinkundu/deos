# Simplified planning workflow provider contracts

Captured on 2026-08-23 before the selector or provider canary was enabled.

## Linear

Primary contract: <https://linear.app/developers/webhooks>

- Verify the unmodified request body with HMAC-SHA256 from `Linear-Signature`.
- Interpret `Linear-Timestamp` as milliseconds.
- Use the UUID in `Linear-Delivery` as the delivery idempotency key.
- Return HTTP 200 for accepted, ignored, and duplicate deliveries.
- Start the simple workflow only when an issue has the exact `simple-workflow`
  label and enters the exact `Todo` state.

Read-only GraphQL preflight returned these stable identifiers for team
`ac53207d-68c0-42f1-a245-c1baf047f234`:

| State | Identifier |
| --- | --- |
| Todo | `ee23b3ec-76fc-4186-8d9e-ddadd1254ee1` |
| In Progress | `700c1b00-b9dd-4cfb-9d59-bd60c1d8d471` |
| Human Review | `71738607-03fd-49f2-b4be-b2aac29ccd13` |
| Merging | `0bc91def-cb76-4e55-a39f-680181382528` |
| Canceled | `6b723450-fcad-448c-b916-9674dc7942fe` |

The read-only label lookup found no `simple-workflow` label. Creating that
label remains part of the approved live-canary sequence and must happen only
after approval of the fully rendered first agent prompt.

## GitHub

Primary contracts:

- Refs: <https://docs.github.com/en/rest/git/refs>
- Repository contents: <https://docs.github.com/en/rest/repos/contents>
- Pull requests and merges: <https://docs.github.com/en/rest/pulls/pulls>

The planning publication sequence is:

1. `GET /repos/{owner}/{repo}/git/ref/heads/main`
2. `POST /repos/{owner}/{repo}/git/refs` for a missing run-scoped branch
3. serial `GET` and `PUT /repos/{owner}/{repo}/contents/{path}` calls with the
   current blob SHA when a file already exists
4. `GET /repos/{owner}/{repo}/pulls?head={owner}:{branch}&base=main&state=open`
5. `POST /repos/{owner}/{repo}/pulls` or `PATCH /repos/{owner}/{repo}/pulls/{number}`
6. `GET /repos/{owner}/{repo}/git/ref/heads/{branch}` to record the published
   head SHA

The trusted merge sequence is:

1. read the stored run work product and compare its issue, repository, branch,
   pull-request number, and expected head SHA with current provider state
2. `PUT /repos/{owner}/{repo}/pulls/{number}/merge` with the expected `sha`
3. `GET /repos/{owner}/{repo}/pulls/{number}` and the base branch ref
4. persist the provider merge receipt and observed base SHA before advancing

A live read-only GitHub App preflight confirmed:

- repository selection: `selected`
- repository: `sachinkundu/deos`
- default branch: `main`
- archived: `false`
- installation permissions: `contents: write`, `pull_requests: write`,
  `metadata: read`

The App token and private key were not printed or recorded.

## Cloudflare Sandbox

Primary contracts:

- Sandbox 1.0 preview: <https://developers.cloudflare.com/sandbox/1-0-preview/>
- Process execution: <https://developers.cloudflare.com/sandbox/1-0-preview/processes/>

The installed package is `@cloudflare/sandbox@0.13.0-next.738.2`. The Docker
base is `cloudflare/sandbox:0.13.0-next.738.2` pinned to a digest, so the client
and container versions match. Commands use argv-form `exec`; launch success is
not completion, so the controller waits for process exit and records bounded
stdout, stderr, exit status, prompt SHA-256, and definition digest.

## Evidence classes

- Unit and integration tests are synthetic coverage only.
- A locally signed webhook is synthetic ingress proof only.
- Provider-originated proof requires Linear to emit the delivery, the deployed
  Worker to receive it, durable records to show the selection and run, GitHub
  to create and merge the pull request, and Linear to show the final state.
