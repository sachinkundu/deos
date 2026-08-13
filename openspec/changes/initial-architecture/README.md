# initial-architecture

Initial proposal architecture for the deos Linear-driven Cloudflare workflow

## Remaining stage gates

The parent change remains open until each child stage is approved, implemented,
proven, and merged. A parent task checkbox stays unchecked until its child stage
has provider-appropriate completion evidence; planning completion alone is not
implementation completion.

1. **Workflow telemetry** — OpenSpec
   [`add-otel-workflow-correlation`](../add-otel-workflow-correlation/), Linear
   [SAC-80](https://linear.app/sachinkundu/issue/SAC-80/add-opentelemetry-workflow-correlation),
   and frozen draft PR [#7](https://github.com/sachinkundu/deos/pull/7). PR #7
   must remain draft until the planning PR is approved, then be relinked to
   SAC-80, rebased, and stripped of the unrelated Queue outcome-contract fix.
2. **R2 artifact provenance** — OpenSpec
   [`add-r2-artifact-provenance`](../add-r2-artifact-provenance/) and Linear
   [SAC-79](https://linear.app/sachinkundu/issue/SAC-79/add-r2-artifact-provenance-and-deterministic-evidence-capture).
   Implementation starts only after the telemetry PR is approved and merged.
3. **Ingress runtime migration** — OpenSpec
   [`migrate-ingress-worker-to-typescript`](../migrate-ingress-worker-to-typescript/)
   and Linear
   [SAC-78](https://linear.app/sachinkundu/issue/SAC-78/migrate-the-http-ingress-worker-from-python-to-typescript).
   Implementation starts only after the R2 provenance PR is approved and merged.
4. **Completion** — after all seven parent tasks are approved and merged, sync
   the child delta specs into main specs, validate the generated baseline, and
   archive `initial-architecture` with final evidence.

Use one implementation PR per stage and wait for explicit approval before
starting the next stage.
