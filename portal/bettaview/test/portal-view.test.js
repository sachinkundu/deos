import assert from "node:assert/strict";
import test from "node:test";
import { selectPortalView } from "../src/portal-view.js";

test("moves directly between PR and Review without a trace sub-state", () => {
  assert.deepEqual(selectPortalView("review"), { activeView: "review", activeQualityPath: null });
  assert.deepEqual(selectPortalView("pr"), { activeView: "pr", activeQualityPath: null });
  assert.throws(() => selectPortalView("process"), /Unknown portal view/);
});
