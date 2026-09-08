# Readable comments and current workflow status

GitHub review replies no longer append DEOS HTML markers. Trusted bot identity and thread relationships identify the replies. Linear comments use a stable provider comment ID instead of an identifier in the body. Linear's CommentCreateInput supports client-supplied IDs: https://github.com/linear/linear-node-sdk/blob/master/schema.md#commentcreateinput

The portal separates the current failed visit from earlier error records. It leads with the durable workflow status and current step. Earlier records remain available in a collapsed history section.

OpenRouter event-stream responses are no longer parsed as a single JSON document. This prevents expected format handling from generating false JSON errors while retaining actual errors.

Validation: 307 Worker tests and 63 portal tests passed, along with both type checks and the canonical portal build. Tests cover streaming heartbeats, plain comment bodies, repeated comment updates, and current versus historical errors.

Live read-back: Worker `516663b1-8ef5-4665-97b3-a1b4a21a11b8` and portal `ac6dc862-5f3d-4a3f-ab95-07523083dbf1` each serve 100% traffic. Codex Browser verified “Workflow running”, “Planning response to independent review”, and collapsed diagnostic history on SAC-160. No workflow retry or comment was sent for verification. Existing comments were not rewritten.
