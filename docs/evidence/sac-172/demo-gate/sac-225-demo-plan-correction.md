# SAC-225 demo-plan correction

The saved calculator plan added a browser-session destruction/reallocation demo.
The runtime permits one service browser per attempt, and the approved calculator
scope does not implement browser allocation. A normal replan could not correct
this because saved scenarios were immutable.

The existing audited failed-run upgrade now accepts a correction request bound to
the saved plan hash, specific scenario IDs, and an operator reason. Only the
independent reviewer receives the grant. It must explain each revision, keep each
scenario, preserve approved requirement references and evidence kinds, and leave
all other scenarios unchanged. The original plan and immutable upgrade remain
stored. A new plan consumes the grant and invalidates an older gate verdict.

The reviewer also receives frozen runtime capabilities. The prompt distinguishes
local workerd proof from an approved nonproduction hosted preview, which remains
required when specified. Correction reasons appear in the existing demo node.

## Local validation

- 558 backend tests passed, including rejection of unauthorized rewrites and
  stale/unknown correction requests, immutable audit materialization, and an
  existing demo workflow restarting through the checked upgrade transaction.
- 102 portal tests passed.
- Backend and portal TypeScript checks passed.
- Generated Worker bindings and strict OpenSpec SAC-172 validation passed.
- Both portal entry points built successfully.
- The built Linux reviewer container rejected an unauthorized rewrite, accepted
  an authorized correction, and required structured correction reasons.
- The first container smoke command failed because the local temporary file was
  not available through its bind mount. Reading that saved file through stdin
  completed the same check successfully; no application failure was hidden.

Logs: /tmp/sac225-demo-correction-tests.log,
/tmp/sac225-demo-correction-portal-tests.log,
/tmp/sac225-demo-correction-image.log.

## Remaining canary work

No canary retry or plan correction has been executed by these local checks.
The approved Pages preview still requires a protected deployment path and final
proof. The existing Cloudflare token is active, but account token-management
access returned HTTP 403 / code 9109. A separate Pages Edit-scoped credential has
been requested through the ignored local .env, without sending its value in chat.
Neither these tests nor a deployment prove that the calculator canary passed.
