import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_FILE_RAIL_WIDTH,
  MIN_FILE_RAIL_WIDTH,
  clampFileRailWidth,
  defaultFileRailWidth,
  maxFileRailWidth,
} from "../src/file-rail.js";

test("clamps the file rail to its usable drag range", () => {
  assert.equal(clampFileRailWidth(100, 1600), MIN_FILE_RAIL_WIDTH);
  assert.equal(clampFileRailWidth(340, 1600), 340);
  assert.equal(clampFileRailWidth(900, 1600), MAX_FILE_RAIL_WIDTH);
  assert.equal(clampFileRailWidth(Number.NaN, 1600), 200);
});

test("defaults the file rail to one eighth of the viewport", () => {
  assert.equal(defaultFileRailWidth(1280), 160);
  assert.equal(defaultFileRailWidth(1600), 200);
});

test("preserves room for the document and thread rails", () => {
  assert.equal(maxFileRailWidth(1300), 385);
  assert.equal(maxFileRailWidth(1400), 430);
  assert.equal(maxFileRailWidth(1000), 160);
  assert.equal(maxFileRailWidth(1600, 500), 480);
});
