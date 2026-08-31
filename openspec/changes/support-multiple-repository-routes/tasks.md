## 1. Route Data and Migration

- [ ] 1.1 Add route, GitHub App install, access audit, event proof, and frozen run fields to D1
- [ ] 1.2 Test that the change keeps the sample policy, active runs, old history, and current revisions
- [ ] 1.3 Backfill the current App install and all active run snapshots, then read them back
- [ ] 1.4 Require full frozen data for new runs, but keep read-only support for old runs

## 2. Provider Lists and Trust Boundary

- [ ] 2.1 Mint short-lived GitHub tokens for a chosen App install
- [ ] 2.2 List GitHub App installs, repos, rights, and settings links with safe paging and errors
- [ ] 2.3 List Linear projects with the current app token and safe paging
- [ ] 2.4 Add a named route-admin Worker entrypoint with strict schemas and no public URL
- [ ] 2.5 Prove that keys, JWTs, tokens, headers, and raw provider replies never cross that boundary

## 3. Route Store

- [ ] 3.1 Replace the single settings read with a route list and exact project lookup
- [ ] 3.2 Add guarded route create and update calls with route-local revisions and read-back
- [ ] 3.3 Turn off only the changed route after a repo or App install change
- [ ] 3.4 Reject such a change only when that same route has active work
- [ ] 3.5 Save workflow and review controls with their own edit revisions and one shared route revision
- [ ] 3.6 Store each live GitHub access check as a safe, append-only row
- [ ] 3.7 Require a fresh pass for repo access and needed rights before route enablement
- [ ] 3.8 Test old edits, route locks, unrelated active routes, access loss, and partial failure

## 4. Settings API and UI

- [ ] 4.1 Bind the portal to route admin and pass only the verified Access email for audit
- [ ] 4.2 Add route list, provider list, create, update, controls, review, and recheck calls
- [ ] 4.3 Add the route list and selected-route editor to the current `/settings` page
- [ ] 4.4 Show each route's project, repo, workflow state, access state, and active-run count
- [ ] 4.5 Add live choices, GitHub settings links, Recheck, and clear provider errors
- [ ] 4.6 Keep saved routes visible when live lists fail, and block unchecked enablement
- [ ] 4.7 Test two routes, route locks, API errors, page flow, access needs, and layout

## 5. Multi-Route Ingress

- [ ] 5.1 Check the event signature, then use D1 instead of a deployed project allowlist
- [ ] 5.2 Add route revision and digest to the queued event and delivery row
- [ ] 5.3 Accept unknown and disabled projects with no queued work
- [ ] 5.4 Test two enabled routes, a disabled route, an unknown route, repeats, old signatures, and fixed label proof

## 6. Route Setup and Dispatch

- [ ] 6.1 Save each workflow definition once and link the current bundle to every route
- [ ] 6.2 Keep each route's repo, App install, controls, revisions, and active work during setup
- [ ] 6.3 Compare queued route proof with D1 before run start and record old proof safely
- [ ] 6.4 Recheck the App install, repo, and needed rights before a run or Sandbox starts
- [ ] 6.5 Freeze the full route, workflow, author settings, and review settings in each new run
- [ ] 6.6 Route later events through the active run snapshot, not new route settings
- [ ] 6.7 Test two routes, unrelated active work, lost access, and old fixed runs

## 7. Frozen Route Use

- [ ] 7.1 Use the run's frozen repo for job input and Sandbox checkout
- [ ] 7.2 Use the frozen repo and App install for work products, branches, and GitHub publish work
- [ ] 7.3 Bind agent tools and provider rights to the frozen route, and reject other targets
- [ ] 7.4 Use the saved App install for merge, review, retry, checks, and repair work
- [ ] 7.5 Test route edits during author, review, and human gates without changing their target

## 8. Docs and Local Checks

- [ ] 8.1 Update architecture, deploy, Settings, and provider docs for the route list and Worker binding
- [ ] 8.2 Run Python, Ruff, Pyright, TypeScript, portal, type, binding, and build checks
- [ ] 8.3 Run strict OpenSpec checks, prose checks, and `git diff --check`
- [ ] 8.4 Capture migration, local D1, setup, route lock, and provider adapter proof

## 9. Deploy and Real Provider Proof

- [ ] 9.1 Read the live Linear project list and GitHub App installs, repos, and needed rights
- [ ] 9.2 Apply the remote D1 change, backfill active runs, and read every saved snapshot back
- [ ] 9.3 Deploy the queue Worker and check route admin, setup, digests, and old run support
- [ ] 9.4 Deploy D1 route admission while only the sample route is enabled
- [ ] 9.5 Deploy the portal binding and Settings UI, then check both through Cloudflare Access
- [ ] 9.6 Add the DEOS project and `sachinkundu/deos` as disabled, check GitHub access, then enable it
- [ ] 9.7 Trigger real Linear issues on both routes and prove separate GitHub work and D1 runs
- [ ] 9.8 Prove one active route does not block settings or new work on the other route
- [ ] 9.9 Prove frozen route data and provider receipts for both real runs
- [ ] 9.10 Prove all Sandboxes were removed and add safe screenshots, command logs, and D1 proof to the code PR
- [ ] 9.11 Keep SAC-143 blocked until both routes pass provider proof and this change is merged
