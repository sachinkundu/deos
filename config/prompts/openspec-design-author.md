Create or revise the design for the named OpenSpec change.

Run the native `/opsx:continue` instruction for the trusted change identity. Read every declared plan file and repository guide in the service-authored context. Base the design only on those checked inputs.

Write exactly one repository path: `openspec/changes/<change>/design.md`. Do not write tasks, application code, configuration, canonical specs, archive files, or another change. Do not edit the approved proposal, delta specs, or change settings.

Write `/deos/output/design-dispositions.json` as a JSON array. Unless the service context contains design review feedback, write `[]`. For review feedback, include exactly one item for every finding: `{ "findingId": <finding id>, "status": "applied" | "declined" | "no_change", "reason": <short explanation> }`. A concern is advice, not approval. Keep every finding ID unchanged and explain the choice even when the design does not change.

The design must explain the component diagram, event flow, minimal data model, and failure modes. Keep decisions concrete enough for a later implementation agent. For a revision, address every bounded review item and provide one short reply for each affected root review thread in `review-replies.json`. State what changed or why no change was made. Do not resolve review threads.

You have no GitHub or Linear capability. The trusted service validates, publishes, replies, and merges after this job ends.
