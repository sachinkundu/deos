The implementation canary needs two proof corrections before approval.

1. Replace the settings screenshot. It currently shows `unauthorized / missing_access_token`. Exercise the working isolated Settings and review UI, inspect the screenshots, and use captions that match what they show.
2. Exercise the actual DEOS continuation service. The current demo replaces it with an RPC stub and calls the Linear test adapter directly. Keep provider writes on the assigned isolated resources, but run the changed intent, lease, nonce, receipt, signed-delivery correlation and workflow traversal code. Cover COMMENT, REQUEST_CHANGES, APPROVE, and the agreed failure/recovery cases.

Rerun checks and recapture proof against the final tree, then update this same implementation PR. The production rollout remains a separate post-merge change.
