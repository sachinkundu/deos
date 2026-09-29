/** Versioned capability documentation travels with the materialized lease input.
 * Frozen workflow prompts may predate these controls; their text stays intact. */
export const sharedTestReviewGuide = {
  version:1,
  helper:'deos-test review REQUEST.json',
  legacyHelper:'If deos-test does not accept review, copy it to /deos/output/deos-test.mjs, add review to its existing kind allowlist, and invoke that copy with Node. Preserve its authentication and request-file behavior. Never print credentials.',
  request:{version:1,operation:'prepare',scenario:'s02'},
  scope:'Use only the supplied checked reviewer. The different-Linear-user part of s01 remains blocked pending owner approval; do not select a different identity or report that part passed. Continue the other authorized checks. For s09, scope.readOnlyPull names a second disposable PR with no linked run. It is readable through the broker; review writes are denied.',
  operations:{
    bootstrap:'Read the checked Settings project and reviewer inputs.',
    prepare:'Use a unique scenario from s01 through s12, optionally with a short suffix. Retain prior facts and allocate the real candidate workflow before opening a fresh browser context.',
    evidence:'Read actual candidate database facts, signed provider deliveries, and labeled injections for the named scenario.',
    'github.read':'Read the fixed fixture PR. Optional path is empty, /reviews, /comments, or /files.',
    'linear.read':'Read the fixed disposable Linear issue.',
    seed_thread:'Create one labeled initial thread on canary-review.md for the named scenario. This setup is not app publication proof.',
    advance_head:'Advance the disposable branch with one fixed edit for the named scenario.',
    move_without_review:'Move the disposable issue without a review for s12. Optional step is 1 or 2.',
    inject:'Arm one labeled outbound fault for the named scenario: github_reject_review, github_drop_reply_response, github_advance_after_reply, linear_reject_move, account_identity_mismatch, or hold_linear_delivery.',
    clear_injections:'Clear armed faults for the named scenario.',
    shorten_delivery_deadline:'After a real Linear mutation with delivery held, shorten only that test input. Read the app to observe the candidate decision.',
  },
  browser:{
    reset:'Reset the browser context, navigate, and sign in again for each scenario. Keep viewport 1440 by 900.',
    select:'Select the rendered paragraph using selector to open the real inline comment composer.',
    api:'Use the current browser session for negative cases and exact replay. Supply url, method GET or POST, and JSON-encoded body for POST. Allowed paths are /api/pr, /api/review-continuations, /api/review-continuations/publish, /api/review-continuations/action, and /api/settings/bettaview-account. Required visible actions still use the UI.',
  },
} as const;
