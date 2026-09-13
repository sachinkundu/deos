import { chromium, expect } from "@playwright/test";
import { demoApi } from "../src/demo.ts";
const browser = await chromium.launch();
const context = await browser.newContext();
let releaseIssue; let releasePoll; let holdPoll = false;
const issueGate = new Promise(resolve => { releaseIssue = resolve; });
const pollGate = new Promise(resolve => { releasePoll = resolve; });
let oldIssueSeen; const issueSeen = new Promise(resolve => { oldIssueSeen = resolve; });
let pollSeen; const pollStarted = new Promise(resolve => { pollSeen = resolve; });
let revision = 1;
let releaseRetry; const retryGate = new Promise(resolve => { releaseRetry = resolve; });
let retrySeen; const retryStarted = new Promise(resolve => { retrySeen = resolve; });
await context.route("**/api/**", async route => {
  const path = new URL(route.request().url()).pathname;
  if (path.endsWith("/retry")) {
    retrySeen(); await retryGate; return route.fulfill({ json: {} });
  }
  if (path.includes("/api/issues/")) {
    const old = path.includes("6936d743");
    if (old) { oldIssueSeen(); await issueGate; }
    const result = structuredClone(demoApi(path));
    result.runs[0].id = old ? "old" : "new";
    result.runs.push({ ...result.runs[0], id: "second", sequence: 3 });
    return route.fulfill({ json: result });
  }
  if (path.includes("/api/runs/")) {
    const p = structuredClone(demoApi(path));
    p.run.id = path.split("/").at(-1);
    p.run.definitionVersion = 1;
    p.retry = { failedAttemptId: "demo-failed-attempt", retryNode: "design_author" };
    p.stages[0].label = `Snapshot ${revision}`;
    p.run.freshness = String(revision);
    if (holdPoll) { pollSeen(); await pollGate; }
    return route.fulfill({ json: p });
  }
  return route.fulfill({ json: demoApi(path) });
});
try {
  const page = await context.newPage(); await page.goto("http://127.0.0.1:4173");
  await page.getByRole("button", { name: /SAC-148/ }).click(); await issueSeen;
  await page.getByRole("button", { name: /SAC-147/ }).click();
  await expect(page.getByRole("heading", { name: "Sample workflow 147" })).toBeVisible();
  await expect(page.getByText("Snapshot 1", { exact: true })).toBeVisible();
  releaseIssue();
  await page.waitForResponse(r => r.url().includes("6936d743"));
  await expect(page.getByRole("heading", { name: "Sample workflow 147" })).toBeVisible();
  const settings = await context.newPage(); await settings.goto("http://127.0.0.1:4173/settings");
  revision = 2; holdPoll = true;
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange"))); await pollStarted;
  await settings.getByRole("switch").check();
  releasePoll();
  await expect(page.getByText("Snapshot 2", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Apply update" })).toHaveCount(0);
  holdPoll = false;
  page.on("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: /Retry / }).click(); await retryStarted;
  revision = 3;
  await page.getByLabel("Workflow run").selectOption("second");
  await expect(page.getByText("Snapshot 3", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Apply update" })).toHaveCount(0);
  releaseRetry();
  await page.waitForResponse(r => r.url().endsWith("/retry"));
  await expect(page.getByLabel("Workflow run")).toHaveValue("second");
  await expect(page.getByText("Snapshot 3", { exact: true })).toBeVisible();
  revision = 4;
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(page.getByText("Snapshot 4", { exact: true })).toBeVisible();
  console.log("Passed: late retry response preserves the selected run and its polling; run switching loads a new baseline; delayed issue response cannot replace current run; poll completion uses the latest mode.");
} finally { await browser.close(); }
