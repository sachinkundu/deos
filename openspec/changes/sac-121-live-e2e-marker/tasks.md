## 1. Canary Marker

- [ ] 1.1 Add `canary/sac-121-pr46-e2e.txt` with the exact bytes `sac-121-pr46-live-e2e\n`.

## 2. Deterministic Verification

- [ ] 2.1 Add a Node test that reads the marker as raw bytes and asserts the complete expected byte sequence.
- [ ] 2.2 Run the Node test locally and confirm it requires no network access, credentials, deployment, or release operation.

## 3. Terminal Archive

- [ ] 3.1 At the authorized terminal archive node, sync the `sac-121-live-e2e-marker` delta into the main OpenSpec specifications and move the completed change into `openspec/changes/archive/`.
