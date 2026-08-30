import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_THREAD_RAIL_WIDTH,
  MIN_THREAD_RAIL_WIDTH,
  clampThreadRailWidth,
  defaultThreadRailWidth,
  maxThreadRailWidth,
  threadRailFontScale,
} from "../src/thread-rail.js";

test("clamps the thread rail while preserving the document column", () => {
  assert.equal(clampThreadRailWidth(100, 1600, 280), MIN_THREAD_RAIL_WIDTH);
  assert.equal(clampThreadRailWidth(430, 1600, 280), 430);
  assert.equal(clampThreadRailWidth(900, 1600, 280), MAX_THREAD_RAIL_WIDTH);
  assert.equal(maxThreadRailWidth(1400, 280), 500);
});

test("defaults to one quarter and scales type only while widening", () => {
  assert.equal(defaultThreadRailWidth(1280), 320);
  assert.equal(defaultThreadRailWidth(1400), 350);
  assert.equal(threadRailFontScale(320, 1280, 160), 0);
  assert.equal(threadRailFontScale(350, 1400, 175), 0);
  assert.equal(threadRailFontScale(600, 1400, 175), 1);
  assert.equal(threadRailFontScale(MAX_THREAD_RAIL_WIDTH, 1600), 1);
});
