# SAC-225 delayed preview readiness

The implementation author reached preview allocation at 19:37:45 UTC on
15 September 2026. The original readiness probe returned HTTP 530 with error
1016 for its full one-minute window. The preview became quarantined. A later
preview request returned `preview_quarantined`; the browser request returned
`preview_missing`.

These original errors were read from R2 and SHA-256 checked against D1:

| Operation | Time (UTC) | Original error SHA-256 |
| --- | --- | --- |
| First preview | 19:38:56.682 | `9cae0c12f203e652c015beb5fe2bbdf8ffe4a170529ff9fa368d0c38cfe5378a` |
| Preview retry | 19:39:30.611 | `aa1d61dd72f3c3140bbdca7c70e894b589f695f3f82635293cf72f6c9cfbcbf7` |
| Browser | 19:39:56.341 | `5f28772ea5ffc75277a71a983529b28e6d3e66bc78625125504f6092a60bd2e5` |

A subsequent read-only request to the same origin's `/__deos/preview-ready`
returned HTTP 200 and `deos-preview-ready`. This proves the relay later became
reachable from the operator's machine. It does not prove the calculator page,
browser scenarios, or a successful Worker-side reconciliation.

The fix reads the existing owned tunnel inventory and fixed health path on a
preview retry or scheduled reconciliation. It creates no replacement tunnel or
process. It checks the current attempt and uses a guarded update so a stale
visit or concurrent cleanup cannot revive the preview. Initial allocation now
saves the tunnel identity before the first health probe. Original errors remain
immutable.

Local verification: all 553 backend tests passed, including seven preview tests
covering late readiness, retained errors, missing/ambiguous/replaced tunnels,
stale attempts, and cleanup during a health check. TypeScript, generated binding
checks, and strict OpenSpec validation passed.

The author stopped at 20:04 UTC with 24 of 25 tasks complete. Its saved transcript
records successful strict OpenSpec validation, all 24 calculator unit tests,
the production build, and all 16 desktop and 320px Playwright tests. The last
unfinished command was `npm run test:evidence`. The native turn then failed with
`Selected model is at capacity. Please try a different model.` No result file
was written. The supervisor incorrectly replaced that cause with a missing
`result.json` error.

The supervisor now preserves the failed native turn and process details before
completion-file validation. A local test of the built container reproduces a
capacity error without a result file. It preserves the original error and edited
work, emits one completion signal, and does not report a missing-result error.
This is a deterministic process test, not provider-originated proof.

Downloaded failure artifacts were SHA-256 checked against D1:

| Artifact | SHA-256 |
| --- | --- |
| Transcript | `f600c575f5a0871c038f3627bd92d5f12f74374339fb855101d1a294be0508e8` |
| Recovery manifest | `e0351564110d1fa1330006a75a66a1678ec2f7f64a3dc7a9f9d6085175d7ba60` |
| Recovery patch | `368befe4f575df1cad6c53d95d4dd066fb54b1a63c3c1dc224ba14c6d400b3cb` |

Deployment and real canary recovery remain pending. The calculator has not
passed its demo gate and no implementation PR has been created.
