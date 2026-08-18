# SAC-119: Terminal Mechanical Archive v10 Canary

## Objective

Exercise frozen DEOS workflow definition version 10 through one complete
provider-originated run whose final autonomous operation is the mechanical
OpenSpec archive.

## Requirements

1. The OpenSpec change MUST define a new marker capability named
   `terminal-archive-canary-marker`.
2. Implementation MUST add `canary/terminal-archive-v10.txt` with exactly the
   UTF-8 bytes `terminal-mechanical-archive-v10\n` and no additional bytes.
3. Implementation MUST add a deterministic Node test that reads the marker as
   bytes and verifies exact equality with those required bytes.
4. After implementation and verification are complete, the terminal archive
   operation MUST sync the change's delta specification into the main OpenSpec
   specifications and move the change into `openspec/changes/archive/`.
5. The terminal archive operation MUST be the final autonomous operation in the
   run.

## Acceptance Criteria

- The marker exists at `canary/terminal-archive-v10.txt` and its byte-for-byte
  content is `terminal-mechanical-archive-v10\n`.
- The deterministic Node test passes and fails for any missing, added, removed,
  or changed marker byte.
- The main OpenSpec specifications contain the synced
  `terminal-archive-canary-marker` capability after the archive operation.
- The corresponding OpenSpec change no longer exists in the active changes
  directory and exists under `openspec/changes/archive/`.
- Durable workflow evidence identifies the archive as the final autonomous
  operation of the provider-originated version 10 run.
- No deployment or release is performed.

## Non-goals

- Changing application behavior beyond the marker file and its deterministic
  test.
- Deploying or releasing any artifact.
- Performing OpenSpec sync or archive before the terminal archive node.
