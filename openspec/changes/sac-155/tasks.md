## 1. Deployment contracts

- [ ] 1.1 Record the live production target, bindings, version, and source baseline; inspect the provider deployment contract.
- [x] 1.2 Resolve credential isolation against Cloudflare's supported token scopes before enabling deployments.

## 2. Portal targets and identity

- [x] 2.1 Add fixed staging configuration sharing the existing stores and provider services.
- [x] 2.2 Show target-supplied site identity in the portal shell and title; expose source SHA and provider version for authenticated read-back.

## 3. Deployment and release flow

- [x] 3.1 Add a fixed staging entrypoint with main ancestry, target preflight, checks, build, deploy, and live verification.
- [x] 3.2 Add serialized manual release promotion and deployment with exact SHA and fast-forward checks.
- [ ] 3.3 Add staging CI and protected environment configuration; document credential cutover and retry procedures.
- [x] 3.4 Test rejected refs, target mismatches, failed builds, failed or ambiguous deploys, and version read-back.

## 4. Live migration and evidence

- [ ] 4.1 Initialize release at the verified production baseline without deploying production.
- [ ] 4.2 Exercise the deployment path on the real staging Worker and capture shared-data and browser evidence.
- [ ] 4.3 Complete credential cutover and run the deliberate no-feature-change production release with 100 percent version read-back.
- [ ] 4.4 Prove a later main-only update changes staging while production stays on the released version.
- [ ] 4.5 Package implementation, checks, and remaining rollout status in one pull request.
