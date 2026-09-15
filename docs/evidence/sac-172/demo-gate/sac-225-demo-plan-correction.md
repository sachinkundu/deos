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


## Deployed and read back

Source commit: `937a50b`.
Backend version `858e80b2-d5f2-4a4f-81e1-ba19692ea7c1` was activated at
2026-09-15T23:32:05.109824Z and read back at 100% traffic.
Container image `sha256:3157a377247c5e6bb659a500e9e3cb018407a1813a41d208667e8689bdbf592c`
was verified through each application detail endpoint at 23:39:26 UTC.
Sandbox80, Standard2Sandbox22, ImplementationSandbox17 and
ImplementationStandard2Sandbox16 were all healthy4/4, with no failed instances
or health errors. The application list temporarily returned old versions after
the individual application endpoints had updated; no extra rollout was started.
Global active attempts were zero immediately before each deployment.

Staging portal version `c0dcc4b3-4275-4e1e-b3d1-56176c8e6923` activated at
23:34:27.972054Z and was read back at 100%. Wrangler subsequently failed listing
zone Workers routes with authentication code10000. The existing staging URL
was verified in Codex Browser: SAC225 loads its Implementation phase, 25/25
checklist, failed Verification, Demo Plan/Gate and Human Review. The route error
was not treated as proof of either failed activation or successful routing.
The live browser confirmed routing separately. No new correction reason is
visible yet because no corrected plan has been accepted.

The deployed read-only upgrade preflight returned HTTP200. It proposed v31 with
one scoped correction for `sac-225-demo-14`, preserved the approved input, saved
patch, branch and human binding, and did not execute. D1 read-back confirms zero
correction audit rows for the failed attempt, unchanged v30/failed/visit36,
unchanged patch/tree, and no implementation PR. The preflight is not provider
canary completion proof. No additional author attempt was launched.
