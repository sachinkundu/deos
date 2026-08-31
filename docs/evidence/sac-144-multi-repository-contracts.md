# SAC-144 Provider Contracts and Test Routes

Date: 2026-08-31

This record grounds the multi-repository adapters in current provider contracts
and safe live responses. It contains no token, private key, authorization
header, or raw provider reply.

## Primary contracts

### Linear

- The API endpoint is `POST https://api.linear.app/graphql`.
- OAuth access tokens use `Authorization: Bearer <token>`. Personal API keys use
  `Authorization: <key>`.
- GraphQL responses may return HTTP 200 with an `errors` array and partial
  `data`. Callers must reject provider errors and validate all required fields.
- List queries use Relay paging. The route catalog uses `first`, `after`,
  `pageInfo.hasNextPage`, and `pageInfo.endCursor`. The documented default is 50
  rows when no page size is given.
- The route catalog needs only project `id`, `name`, `url`, and team `id`,
  `name`, and `key`.
- Webhooks sign the raw body with HMAC-SHA256 in `Linear-Signature`.
  `Linear-Timestamp` and body `webhookTimestamp` are Unix milliseconds.
  `Linear-Delivery` is the unique delivery id. Linear recommends a one-minute
  freshness check and HTTP 200 after accepted processing.

Primary sources:

- [Linear GraphQL API](https://linear.app/developers/graphql)
- [Linear pagination](https://linear.app/developers/pagination)
- [Linear webhooks](https://linear.app/developers/webhooks)

### GitHub App

- App authentication uses an RS256 JWT. `iat` is in Unix seconds and should be
  60 seconds in the past. `exp` must be no more than 10 minutes ahead. `iss` is
  the App client id or App id. JWT requests use `Authorization: Bearer`.
- `GET /app/installations` uses the App JWT. Each row supplies the installation
  id, account, repository selection, permissions, suspension state, and an
  installation settings URL.
- `POST /app/installations/{installation_id}/access_tokens` uses the App JWT.
  The returned installation token expires after one hour. It cannot gain repos
  or rights that the installation lacks.
- `GET /installation/repositories` uses the installation token. It uses page
  numbers with `per_page` up to 100 and returns `total_count` plus repository
  rows.
- Route choices retain only repository id, full name, default branch, archive
  and disabled state, installation id, installation permissions, and the safe
  settings URL.
- Adding one selected repository uses
  `PUT /user/installations/{installation_id}/repositories/{repository_id}`.
  GitHub requires repository admin access and a classic PAT with `repo` scope.
  App JWTs, installation tokens, App user tokens, OAuth tokens, and fine-grained
  PATs cannot call this endpoint.
- DEOS needs installation permissions `metadata:read`, `contents:write`,
  `pull_requests:write`, and `checks:write` for its current work.

Primary sources:

- [GitHub App JWTs](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-json-web-token-jwt-for-a-github-app)
- [GitHub App endpoints](https://docs.github.com/en/rest/apps/apps)
- [GitHub App installation endpoints](https://docs.github.com/en/rest/apps/installations)

### Cloudflare Workers and D1

- A service binding lets one Worker call another without a public URL.
- The queue Worker can export a named `WorkerEntrypoint`. The portal declares a
  `services` binding and awaits its typed RPC methods.
- A binding grants call capability. The route-admin entrypoint must still
  validate each value and accept only the verified operator email for audit.
- D1 remains the durable authority. Guarded writes use prepared statements and
  read-back. Run allocation will use one conditional write so a concurrent route
  edit cannot allocate stale work.

Primary sources:

- [Cloudflare service binding RPC](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/rpc/)
- [Cloudflare D1 Worker API](https://developers.cloudflare.com/d1/worker-api/)

## Safe live response proof

### Linear projects

The authenticated Linear connector returned three existing projects, then read
back the newly created fourth project. The two test route ids are:

| Purpose | Linear project | Project id |
| --- | --- | --- |
| First sample route | `deos-sample-project` | `99426d9b-cda7-4db4-9136-692a95a0b090` |
| Second sample route | `deos-sample-project-2` | `b0b6265d-5e61-4315-9ef4-724ddb391700` |

Both belong to team `SAC` (`ac53207d-68c0-42f1-a245-c1baf047f234`).
The second project was created in Backlog and read back with its stable URL.

### GitHub installation and repositories

A real App JWT listed one active selected-repository installation:

- installation id: `154095438`;
- account: `sachinkundu`;
- settings URL: `https://github.com/settings/installations/154095438`;
- permissions: `metadata:read`, `contents:write`, `pull_requests:write`, and
  `checks:write`.

An installation token then returned these accessible repositories:

| Repository | Repository id | Default branch |
| --- | --- | --- |
| `sachinkundu/deos` | `1330744912` | `main` |
| `sachinkundu/deos-sample-project` | `1345702511` | `main` |

The second repository now exists as
`sachinkundu/deos-sample-project-2`, repository id `1352134004`, with default
branch `main`. It is not yet in the installation list.

The current GitHub CLI OAuth token correctly failed the add-repository endpoint
with HTTP 403. This matches the primary contract: that endpoint accepts only a
classic PAT with `repo` scope. No App or repository setting changed in that
failed call.

## Fixed provider-proof task

After App access is granted, both routes will receive this exact issue title:

> create a simple text graphics generator which can create popular graphics on command line terminal

The two issues must produce separate D1 runs and separate GitHub work in their
own repositories. `sachinkundu/deos` is added as a third enabled route only
after both pass, and no DEOS issue starts during this change.

## Current external prerequisite

The owner must add `sachinkundu/deos-sample-project-2` to GitHub App installation
`154095438` at the settings URL above. Implementation of provider adapters stays
paused until a fresh App JWT and installation token read that repository back.
