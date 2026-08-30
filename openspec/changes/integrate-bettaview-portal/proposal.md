## Why

DEOS already keeps the trace and review evidence for SAC-139, but the current portal cannot read the planning pull request and the complete review process in one place. BettaView has the stronger pull-request reader, so DEOS should own and deploy it as the integrated review portal.

## What Changes

- Import the pinned BettaView source into DEOS and maintain its production build here.
- Deploy a protected BettaView Worker at `bettaview.voxdez.com`.
- Let a reader open one planning pull request and move between focused **PR** and **Review** views.
- Resolve the DEOS run from the canonical GitHub repository and pull-request number.
- Show accepted trace evidence and the retained author, self-review, external-review, and author-disposition records that explain the final pull-request result.
- Keep Linear transitions, workflow visits, provider operations, waits, retries without semantic review output, and cleanup activity in the main DEOS portal instead of repeating them in BettaView.
- Add **Open on GitHub** and **Open in BettaView** actions to the DEOS workflow node detail.
- Render each run from the exact frozen workflow definition it selected at allocation, without a deployment-specific digest allowlist.
- Keep semantic trace generation in DEOS. The cloud BettaView Worker cannot start Codex or another model.
- Keep GitHub review writes tied to the signed-in human identity. Reading remains available when a viewer lacks a specific write permission.
- Remove the redundant author self-review from later revision rounds. After Human Review requests changes, the author updates and publishes the plan, the external reviewer reviews the new head, and the author returns it to Human Review.

### Non-goals

- Start or rerun a DEOS workflow for portal validation.
- Move workflow orchestration or semantic review into BettaView.
- Invent review content that an older run did not retain.
- Keep a second production BettaView source repository.

## Capabilities

### New Capabilities

- `integrated-bettaview-portal`: Reads a GitHub planning pull request, its accepted trace, and its focused review story in one protected portal.

### Modified Capabilities

- `workflow-observability`: Resolves a governed run from its canonical pull request and exposes safe, hash-verified review records while retaining operational workflow activity in the main DEOS portal.

## Impact

- Adds `portal/bettaview/`, a second Cloudflare Worker deployment, and its static application build.
- Extends the DEOS portal read model and routes for pull-request lookup and complete review-story data.
- Changes the workflow node detail so both GitHub and BettaView can open the same planning pull request.
- Advances `simple-traceability` to version 13 so later human revision rounds skip the author self-review while retaining external exact-head review.
- Keeps workflow identity immutable within a run while allowing different issues to use different workflow definitions or versions.
- Uses the existing SAC-139 run as production proof and does not allocate a new workflow run.
