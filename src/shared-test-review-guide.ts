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
    evidence:'Read actual candidate database facts, signed provider deliveries, labeled injections for the named scenario, and current lease proof publication status. A capture starts private and pending; check proof again before reporting its publication blocked. Only public_safe items with sanitizerResult passed and a publicUrl have been published.',
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
    reload:'For the draft persistence check, navigate to the current PR URL with beforeUnload:"accept". This explicitly confirms the native leave-drafts prompt. Then inspect the reloaded drafts before publishing. A navigation timeout is not provider session absence: read state and use a fresh scenario context; do not abandon later scenarios solely because a navigation failed.',
    wait:'Wait requires a visible CSS selector, for example {version:1,service:"bettaview",operation:"wait",selector:"button"}. It does not accept milliseconds or a duration.',
    reset:'Reset the browser context, navigate, and sign in again for each scenario. Keep viewport 1440 by 900. If the provider session has ended, reset permits one replacement per service and attempt after two absence reads and a saved lifecycle receipt. Navigate and inspect the new session; never blindly repeat a publish or review action. If the replacement also ends, retain the error and stop browser work.',
    select:'Select the rendered paragraph using selector to open the real inline comment composer.',
    api:'Use the current browser session for negative cases and exact replay. Supply url, method GET or POST, and JSON-encoded body for POST. Allowed paths are /api/pr, /api/review-continuations, /api/review-continuations/publish, /api/review-continuations/action, and /api/settings/bettaview-account. Required visible actions still use the UI.',
  },
  examples:{
    mismatch:{version:1,operation:'inject',scenario:'s01-after',kind:'account_identity_mismatch'},
    injectionScope:'Use the exact scenario ID most recently returned by prepare, including its suffix, when arming a fault. Read the response before attempting the app action. A rejected injection request is not evidence that the app rejected a mismatched identity.',
    frozenAccount:'Connect the account first, then prepare s01-freeze to allocate a new run with policy version 1. A run prepared before connection correctly keeps its original null account. After rotation, read evidence for s01-freeze to check that its frozen version stays 1.',
  },
} as const;
