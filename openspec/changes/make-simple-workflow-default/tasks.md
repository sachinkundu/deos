## 1. Default Simple Workflow

- [x] 1.1 Make existing simple version 4 the bundled and registered project-policy default while keeping every definition available for historical restoration.
- [x] 1.2 Remove selector registration and label-based selection from new-run dispatch while retaining delivery evidence integrity checks and durable default selection.
- [x] 1.3 Add deterministic tests proving labeled, unlabeled, and label-unavailable start events select the same simple definition and legacy selector state has no effect.

## 2. Settings and Portal Routing

- [x] 2.1 Remove selector fields, copy, request parsing, queries, and mutations from the settings API and UI while preserving repository and dispatch guards and read-back.
- [x] 2.2 Build the approved visualization and existing settings application as two production entries without one build erasing the other.
- [x] 2.3 Route `/`, `/settings`, `/settings/`, declared assets, and unsupported browser paths explicitly after Access authentication.
- [x] 2.4 Add deterministic settings, route, authentication, method, and generated-asset tests proving `/settings` cannot fall through to visualization.

## 3. Validation and Deployment

- [x] 3.1 Run workflow, Queue, portal, presentation, TypeScript, production-build, and strict OpenSpec checks; preserve simple version 4 and historical-definition compatibility coverage.
- [x] 3.2 Confirm the remote dispatch and active-run baseline, deploy the Queue and portal Workers with dispatch disabled, and read back the exact simple version 4 policy identity and minimum bindings.
- [x] 3.3 Verify the deployed authenticated `/`, `/settings`, and unsupported-path results in the browser and confirm settings contains dispatch but no selector control.
