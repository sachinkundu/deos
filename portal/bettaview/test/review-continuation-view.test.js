import test from "node:test";
import assert from "node:assert/strict";
import { continuationBlocked, renderAccountSettings, renderContinuationStatus, restoredContinuationStatus } from "../src/review-continuation-view.js";

test("blocks stale, closed, unlinked, and legacy reviews with reload guidance", () => {
  for (const readiness of ["stale_head", "closed", "unlinked", "legacy_draft"]) assert.equal(continuationBlocked({ readiness }), true);
  const html = renderContinuationStatus({ readiness: "stale_head", reason: "Load the new head." });
  assert.match(html, /Review remains readable/);
  assert.match(html, /Reload current head/);
});

test("keeps GitHub complete while Linear needs attention", () => {
  const html = renderContinuationStatus({ readiness: "ready" }, {
    goalState: "Merging", github: { label: "GitHub review", status: "done", complete: true },
    linear: { label: "Linear · Merging", status: "host_check_required", complete: false },
    outcome: "host_check_required", continued: false, actions: ["reload"],
  });
  assert.match(html, /continuation-step complete/);
  assert.match(html, /continuation-step warning/);
  assert.doesNotMatch(html, /The linked workflow continued/);
});

test("settings describes correlation without claiming repository permission", () => {
  const html = renderAccountSettings();
  assert.match(html, /does not grant GitHub repository permission/);
  assert.match(html, /Human Review · In Progress · Merging/);
  assert.doesNotMatch(html, /reviewer approval/);
});

test("restored continuation status keeps retry actions bound after a fresh pull-request load", () => {
  const status = { reviewId: "review-1", actions: ["retry"] };
  assert.equal(restoredContinuationStatus({ status }), status);
  assert.equal(restoredContinuationStatus({ readiness: "ready" }), null);
  assert.equal(restoredContinuationStatus(null), null);
});
