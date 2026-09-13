import { chromium, expect } from "@playwright/test";
import { demoApi } from "../src/demo.ts";
import { mkdir } from "node:fs/promises";
const origin = "http://127.0.0.1:4173";
const output = "docs/evidence/sac-153-implementation";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
let revision = 1; let fail = false; let malformed = false;
const requests = [];
const fixture = () => {
  const p = structuredClone(demoApi("/api/runs/demo"));
  p.run.definitionVersion = 1; // Exercise status, graph, history, and counts in the full map.
  p.run.status = revision === 1 ? "active" : "succeeded";
  p.run.freshness = `2026-09-13T10:0${revision}:00Z`;
  p.stages[0].label = `Snapshot ${revision}`;
  p.stages[0].visits = revision;
  p.history[0].label = `History ${revision}`;
  if (malformed) p.stages = null;
  return p;
};
async function setup(ctx) {
  await ctx.route("**/api/**", async route => {
    const req = route.request(); requests.push({ url: req.url(), method: req.method(), body: req.postData() });
    const path = new URL(req.url()).pathname;
    if (path.startsWith("/api/runs/")) {
      if (fail) return route.fulfill({ status: 503, body: "read temporarily unavailable" });
      return route.fulfill({ json: fixture() });
    }
    return route.fulfill({ json: demoApi(path) });
  });
}
await setup(context);
const page = await context.newPage();
const tick = async () => {
  const response = page.waitForResponse(r => new URL(r.url()).pathname.startsWith("/api/runs/"));
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await response;
};
const openRun = async p => { await p.goto(origin); await p.getByRole("button", { name: /SAC-148/ }).click(); await expect(p.getByText("Snapshot 1", { exact: true })).toBeVisible(); };
try {
  await openRun(page);
  revision = 2; await tick();
  await expect(page.getByRole("button", { name: "Apply update" })).toBeVisible();
  await expect(page.getByText("Snapshot 1", { exact: true })).toBeVisible();
  await page.screenshot({ path: `${output}/manual-pending.png`, fullPage: true });
  revision = 3; await tick();
  await page.getByRole("button", { name: "Apply update" }).click();
  await expect(page.getByText("Snapshot 3", { exact: true })).toBeVisible();
  await expect(page.getByText("History 3", { exact: true }).first()).toBeVisible();
  const settings = await context.newPage(); await settings.goto(`${origin}/settings`);
  const toggle = settings.getByRole("switch"); await expect(toggle).not.toBeChecked();
  revision = 4; await tick(); await expect(page.getByRole("button", { name: "Apply update" })).toBeVisible();
  await settings.waitForLoadState("networkidle");
  const before = requests.length;
  await toggle.check();
  await expect(page.getByText("Snapshot 4", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Apply update" })).toHaveCount(0);
  if (requests.length !== before) throw new Error(`Preference toggle emitted a request: ${JSON.stringify(requests.slice(before))}`);
  await settings.screenshot({ path: `${output}/settings-live.png`, fullPage: true });
  await settings.reload(); await expect(settings.getByRole("switch")).toBeChecked();
  revision = 5; await tick(); await expect(page.getByText("Snapshot 5", { exact: true })).toBeVisible();
  await page.screenshot({ path: `${output}/live-applied.png`, fullPage: true });
  fail = true; await tick(); await expect(page.getByText(/read temporarily unavailable/)).toBeVisible();
  await expect(page.getByText("Snapshot 5", { exact: true })).toBeVisible(); fail = false;
  await settings.getByRole("switch").uncheck(); revision = 6; await tick();
  await expect(page.getByRole("button", { name: "Apply update" })).toBeVisible();
  await expect(page.getByText("Snapshot 5", { exact: true })).toBeVisible();
  await settings.getByRole("switch").check();
  await expect(page.getByText("Snapshot 6", { exact: true })).toBeVisible();
  const other = await browser.newContext(); await setup(other);
  const isolated = await other.newPage(); await isolated.goto(`${origin}/settings`);
  await expect(isolated.getByRole("switch")).not.toBeChecked(); await other.close();
  await settings.close(); const reopened = await context.newPage(); await reopened.goto(`${origin}/settings`);
  await expect(reopened.getByRole("switch")).toBeChecked();
  await reopened.evaluate(() => localStorage.setItem("deos-live-updates", "invalid"));
  await reopened.reload(); await expect(reopened.getByRole("switch")).not.toBeChecked();
  await expect(reopened.getByText(/saved choice could not be loaded/)).toBeVisible();
  const denied = await browser.newContext(); await setup(denied);
  await denied.addInitScript(() => {
    Object.defineProperty(window, "localStorage", { get() { throw new DOMException("Storage denied", "SecurityError"); } });
  });
  const deniedPage = await denied.newPage(); await deniedPage.goto(`${origin}/settings`);
  await expect(deniedPage.getByRole("switch")).not.toBeChecked();
  await deniedPage.getByRole("switch").check();
  await expect(deniedPage.getByText(/active only for this page/)).toBeVisible();
  await deniedPage.screenshot({ path: `${output}/storage-warning.png`, fullPage: true });
  await denied.close();
  await reopened.getByRole("switch").check(); malformed = true; await tick();
  await expect(page.getByRole("heading", { name: "Workflow view unavailable" })).toBeVisible();
  await page.screenshot({ path: `${output}/render-error.png`, fullPage: true });
  for (const request of requests) {
    const text = JSON.stringify(request);
    if (text.includes("deos-live-updates") || text.includes('"enabled"') || request.method !== "GET") throw new Error(`Unexpected preference request: ${text}`);
  }
  console.log(JSON.stringify({ result: "passed", apiRequests: requests.length, scenarios: ["manual baseline", "latest pending", "atomic snapshot", "pending promotion", "cross-tab sync", "reload", "reopen", "live polling", "poll failure preservation", "disable", "browser isolation", "invalid storage", "denied storage", "render failure", "no preference requests"] }));
} finally { await browser.close(); }
