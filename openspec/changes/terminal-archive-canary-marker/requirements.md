# Terminal archive canary marker requirements

## Acceptance criteria

- The repository contains `canary/terminal-archive-v10.txt` with the exact bytes `terminal-mechanical-archive-v10\n`.
- A deterministic Node test reads that file as bytes and verifies the exact expected bytes.
- The terminal archive operation synchronizes this change's delta specification into the main OpenSpec specifications and moves this change into `openspec/changes/archive/`.
- The change does not deploy or release anything.
