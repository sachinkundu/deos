# Quoted arguments in the review reader

SAC-170 review attempt `01a0956a-3a29-778f-aa53-4b186d7d5aca` failed on:

```text
rg -n -i "skill|subagent|web search|harness" docs/current-architecture.md
```

The shared reader rejected every pipe character before it parsed quotes. The
quoted pipes above are regex alternatives, not shell pipelines. The same check
also rejected quoted dollar anchors and literal punctuation. Its regex-based
tokenizer did not reliably handle escapes or adjacent quoted word fragments.

Commit `50c99dc` replaces that check with argument parsing that tracks quotes
and escapes. Quoted characters stay data. Unquoted shell operators remain
forbidden. The parsed operation still goes to the bounded snapshot reader;
reviewer input never reaches a shell. Operation, flag, frozen-path, and hash
checks remain in place. Both Claude and native self-review use this parser.

The tool description now documents quoting, regex escapes, and the `--`
separator for patterns beginning with a hyphen. Unsupported flags and actual
shell commands remain unsupported; this is a small read interface, not a full
implementation of the `rg`, `sed`, or other command-line programs.

Validation: 388 backend tests passed; TypeScript checks passed. A real local
reader subprocess receives a saved request file, materializes frozen sources,
and runs the exact production search. Other cases check quoted regex anchors,
word boundaries, whitespace escapes, literal punctuation, escaped quotes,
paths with spaces, and rejection of shell execution and out-of-snapshot reads.
The existing tests still check source hashes and error retention.

One adjacent issue remains separate: a rejected tool call marks the whole
Claude invocation failed in `src/claude-runner.ts`. Recoverable tool mistakes
should be returned to the reviewer with the exact error so it can correct the
request under bounded retry rules. Unexpected failures and boundary violations
must retain their causes. This belongs with SAC-174's recovery contract.

## Production rollout

After confirming no agent attempts were active, the backend was deployed.
Readback confirmed Worker `bd4f0a74-584c-43db-8755-37378771328f` at 100% traffic
and all four containers healthy on image
`sha256:a275dfc2c81de9cc167606907ce5724bdbc3ed71dc40e3bf787232381844f875`.
The gradual rollout completed. Neither portal was deployed.

At 12:04:29 UTC on September 12, the supported retry endpoint accepted one
retry of the failed reader attempt in the same business run and frozen v24
definition, advancing visit 47 to 48. New Workflow instance:
`wf-v1-qukaj5wlowestvgpyeel6orrimijpsnvy2b6wxqhvtwa2xdv7trq`.
New review attempt: `01a09581-521a-717b-abf6-bd402993d528`.
The review outcome remains pending, and the monitor is active.

[Showboat validation, rollout, and retry output](reader-rollout.md) records
the actual command results. Temporary operator helpers and request files were
saved under `/tmp`; do not replay mutation commands as verification.
