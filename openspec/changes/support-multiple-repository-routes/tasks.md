## 1. Provider Contracts and Test Resources

- [x] 1.1 Read primary docs for Linear data, GitHub App access, and Worker bindings
- [x] 1.2 Record exact auth, fields, time units, paging, errors, and rights
- [x] 1.3 Use safe live calls to prove the real Linear and GitHub response shapes
- [x] 1.4 Confirm the first sample project and repo. Create a second sample project and repo
- [ ] 1.5 Grant the DEOS GitHub App access to the second repo. Read the access back
- [x] 1.6 Record both test route ids and the exact shared issue text before adapter code starts

## 2. Route Data and Migration

- [ ] 2.1 Add route, GitHub App install, access audit, event proof, and frozen run fields to D1
- [ ] 2.2 Test that the change keeps the sample policy, active runs, history, and revisions
- [ ] 2.3 Backfill the current App install and all active run snapshots, then read them back
- [ ] 2.4 Require full frozen data for new runs, but keep read-only support for old runs

## 3. Provider Lists and Trust Boundary

- [ ] 3.1 Mint short-lived GitHub tokens for one App install under the verified contract
- [ ] 3.2 List every App-accessible repo, its rights, and its settings link with safe paging and errors
- [ ] 3.3 List Linear projects with the current app token and safe paging
- [ ] 3.4 Add a named route-admin Worker entrypoint with strict schemas and no public URL
- [ ] 3.5 Prove that secrets, auth headers, and raw provider replies never cross that boundary

## 4. Route Store

- [ ] 4.1 Replace the single settings read with a route list and exact project lookup
- [ ] 4.2 Add guarded route create and update calls. Use route revisions and read-back
- [ ] 4.3 Turn off only the changed route after a repo or App install change
- [ ] 4.4 Allow route, workflow, and review edits during active work while keeping each run fixed
- [ ] 4.5 Save each control with its own edit revision and one shared route revision
- [ ] 4.6 Store each live GitHub access check as a safe, append-only row
- [ ] 4.7 Require a fresh pass for repo access and needed rights before route enablement
- [ ] 4.8 Test old edits, same-route active edits, access loss, read-back, and partial failure

## 5. Settings API and UI

- [ ] 5.1 Bind the portal to route admin. Pass only the verified Access email for audit
- [ ] 5.2 Add route list, provider list, create, update, controls, review, and recheck calls
- [ ] 5.3 Add the route list and selected-route editor to the current `/settings` page
- [ ] 5.4 Let users pair any repo returned by the DEOS GitHub App with a Linear project
- [ ] 5.5 Show each route's project, repo, workflow state, access state, and active-run count
- [ ] 5.6 Add GitHub settings links, Recheck, and clear provider errors
- [ ] 5.7 Keep saved routes visible when live lists fail, and block unchecked enablement
- [ ] 5.8 Test two routes, active-run edits, API errors, page flow, access, and layout

## 6. Multi-Route Ingress

- [ ] 6.1 Check the event signature, then use D1 instead of a deployed project allowlist
- [ ] 6.2 Add route revision and digest to the queued event and delivery row
- [ ] 6.3 Accept unknown and disabled projects with no queued work
- [ ] 6.4 Test enabled, disabled, and unknown routes. Test repeats, old signatures, and fixed label proof

## 7. Route Setup and Atomic Dispatch

- [ ] 7.1 Save each workflow definition once and link the current bundle to every route
- [ ] 7.2 Keep each route's repo, App install, controls, revisions, and active work during setup
- [ ] 7.3 Compare queued route proof with a current D1 route before the live GitHub check
- [ ] 7.4 Recheck the App install, repo, and needed rights before a run or Sandbox starts
- [ ] 7.5 Create the run and frozen route in one D1 operation. Guard it with the same enabled revision and digest
- [ ] 7.6 Record a stale-route result and start no run when that atomic guard fails
- [ ] 7.7 Route later events through the active run snapshot, not new route settings
- [ ] 7.8 Test edits during the GitHub check and active runs. Test lost access and old fixed runs

## 8. Frozen Route Use

- [ ] 8.1 Use the run's frozen repo for job input and Sandbox checkout
- [ ] 8.2 Use the frozen repo and App install for work products, branches, and GitHub work
- [ ] 8.3 Bind agent tools and provider rights to the frozen route, and reject other targets
- [ ] 8.4 Use the saved App install for merge, review, retry, checks, and repair work
- [ ] 8.5 Test route edits during author, review, and human gates without changing their target

## 9. Docs and Local Checks

- [ ] 9.1 Update architecture, deploy, Settings, and provider docs for the route list and Worker binding
- [ ] 9.2 Run Python, Ruff, Pyright, TypeScript, portal, type, binding, and build checks
- [ ] 9.3 Run strict OpenSpec checks, prose checks, and `git diff --check`
- [ ] 9.4 Capture contract, migration, local D1, atomic start, and provider adapter proof

## 10. Deploy and Real Provider Proof

- [ ] 10.1 Recheck the live Linear projects, GitHub App repos, rights, and saved test ids before deploy
- [ ] 10.2 Apply the remote D1 change and backfill active runs. Read each saved snapshot back
- [ ] 10.3 Deploy the queue Worker and check route admin, setup, digests, and old run support
- [ ] 10.4 Deploy D1 route admission while only the first sample route is enabled
- [ ] 10.5 Deploy the portal binding and Settings UI. Check both through Cloudflare Access
- [ ] 10.6 Add and enable the second sample route in Settings. Read both routes back
- [ ] 10.7 Create this real issue in both sample projects: "create a simple text graphics generator which can create popular graphics on command line terminal"
- [ ] 10.8 Run both issues and prove separate GitHub work, D1 runs, and provider receipts
- [ ] 10.9 Change a route setting during active work and prove the save succeeds while that run stays fixed
- [ ] 10.10 Prove all Sandboxes are removed. Add safe screenshots, command logs, and D1 proof to the code PR
- [ ] 10.11 After both sample runs pass, add and enable the DEOS project with `sachinkundu/deos` as the third route without starting an issue
- [ ] 10.12 Keep SAC-143 blocked until the two sample routes pass provider proof and this change is merged
