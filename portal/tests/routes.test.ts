import assert from "node:assert/strict";
import test from "node:test";
import { portalPageFromPath, portalPathForPage } from "../src/routes.ts";

test("portal paths select one explicit view", () => {
  assert.equal(portalPageFromPath("/"), "workflow");
  assert.equal(portalPageFromPath("/settings"), "settings");
  assert.equal(portalPageFromPath("/settings/"), "settings");
  assert.equal(portalPageFromPath("/future-tool"), "not-found");
});

test("portal navigation uses stable canonical paths", () => {
  assert.equal(portalPathForPage("workflow"), "/");
  assert.equal(portalPathForPage("settings"), "/settings");
});
