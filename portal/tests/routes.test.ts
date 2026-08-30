import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

test("the production build keeps separate visualization and settings entries", () => {
  const packageJson = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
    scripts?: Record<string, string>;
  };
  const build = packageJson.scripts?.["portal:build"] ?? "";
  assert.match(build, /build:portal/);
  assert.match(build, /vite\.settings\.config\.ts/);
  assert.match(readFileSync(new URL("../settings.html", import.meta.url), "utf8"), /DEOS Workflow Settings/);
  assert.match(readFileSync(new URL("../vite.settings.config.ts", import.meta.url), "utf8"), /emptyOutDir: false/);
  assert.doesNotMatch(readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"), /single-page-application/);
  assert.match(readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"), /"html_handling": "none"/);
  assert.match(readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8"), /href="\/"[^>]*><Gear \/>Workflows/);
});

test("the deployed workflow inspector offers GitHub and BettaView PR links", () => {
  const source = readFileSync(
    new URL("../../prototypes/sac-123-workflow-view/src/App.jsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /https:\/\/bettaview\.voxdez\.com\/\?pr=/);
  assert.match(source, /Read in BettaView/);
  assert.match(source, /GitHub ·/);
});
