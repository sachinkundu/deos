# Original-error preservation: deployed proof

*2026-09-07T15:05:04Z by Showboat 0.6.1*
<!-- showboat-id: f20b6a88-a6d7-4e80-8275-d4eb258bd746 -->

A temporary Worker running the shared capture code made a read-only GitHub request for a missing pull request. GitHub returned a real HTTP 404. This is real provider-response evidence, not a retry of SAC-160 or a Linear webhook test. The temporary Worker is removed after verification.

```bash
rtk proxy python3 scripts/inspect-original-errors.py --env-file /Users/sachin/code/deos/.env --run-id diagnostic-proof:6da9a955965c4f4390308b1967dee33b
```

```output
[
  {
    "error_id": "2f46407d-e187-423d-937d-f67afec30d26",
    "step_name": "GitHub read-only diagnostic proof",
    "location": "uncaught",
    "message": "GitHub HTTP 404: {\"message\":\"Not Found\",\"documentation_url\":\"https://docs.github.com/rest/pulls/pulls#get-a-pull-request\",\"status\":\"404\"}",
    "occurred_at": "2026-09-07T15:02:08.543Z"
  }
]
```

## Live browser verification

The protected [SAC-160 portal](https://deos.voxdez.com/?issue=SAC-160) shows its failed publication above the workflow map. It explicitly states that this historical failure did not retain an original error. The issue, run, and retry state were not changed.

The protected [full diagnostic page](https://deos.voxdez.com/failure-detail/2f46407d-e187-423d-937d-f67afec30d26) was opened in Codex Browser. It displayed GitHub's full original 404 message, response body, response headers, request ID, and stack. The API response itself was blocked on top-level navigation by the operator browser, so full details now have a regular authenticated HTML page. Error content is escaped as text.

The temporary provider probe Worker has been deleted. The error record is retained as proof. This did not resume or retry SAC-160.

## Checks

- 300 Worker tests passed.
- 61 portal tests passed.
- 38 Python tests passed.
- TypeScript, portal types, generated binding checks, Python lint, and strict OpenSpec validation passed.
- Canonical production portal build passed.
