## Context

The publication catch discarded the exception and kept only a category. That made SAC-160 impossible to diagnose from the portal.

## Decisions

Capture exceptions before handling them. Use an async context for each workflow step and authenticated capability request, so concurrent runs cannot mix errors. Keep categories for existing control flow. Attach causes to context errors.

Save complete structured errors to R2 and index them by run in D1. Await these writes before completing the step. If storage fails, retain both failures in an AggregateError and Workers logs. The portal shows messages above the workflow map and links to complete detail behind its existing Access check. Legacy failures are labeled as missing original evidence.

Keep full provider HTTP bodies and headers. Retain partial bodies on stream errors. Container processes append original exceptions to a collected artifact and stderr. Do not filter diagnostic contents or impose arbitrary evidence size limits. Continue to exclude credential files themselves.

## Rollout

Apply the additive error table first. Deploy the worker, matching container, and canonical portal build. Verify deployment traffic and the rendered protected portal. Leave SAC-160 and its review state unchanged. Existing workflow definitions and retry policy do not change.
