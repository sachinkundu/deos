/** Real staging browser check. The short-lived assertion must belong to the reviewer. */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const host = "https://deos-staging.voxdez.com";
const assertion = process.env.PORTAL_REVIEWER_ACCESS_ASSERTION;
const sha = process.env.REVIEWED_SHA ?? process.env.GITHUB_SHA;
if (!assertion || !/^[a-f0-9]{40}$/.test(sha ?? "")) throw new Error("A reviewer Access assertion and full source SHA are required");
const browser = await chromium.launch();
try {
  const context = await browser.newContext();
  await context.addCookies([{ name: "CF_Authorization", value: assertion, url: host, httpOnly: true, secure: true }]);
  const page = await context.newPage();
  const get = async path => {
    // The version endpoint has its own service-token Access application.
    const headers = path === "/api/version" ? {
      "CF-Access-Client-Id": process.env.PORTAL_ACCESS_CLIENT_ID,
      "CF-Access-Client-Secret": process.env.PORTAL_ACCESS_CLIENT_SECRET,
    } : {};
    if (path === "/api/version" && Object.values(headers).some(value => !value)) {
      throw new Error("The version check requires the existing portal Access service credentials");
    }
    const response = await context.request.get(host + path, { maxRedirects: 0, headers });
    assert.equal(response.status(), 200, `Staging ${path} must return 200`);
    return response.json();
  };
  assert.equal((await get("/api/version")).sourceSha, sha);
  await get("/api/recent-issues"); // Reject missing schema, service, or stable reviewer identity before searches.
  const candidates = (await get("/api/issues?query=SAC")).issues;
  const eligible = [];
  for (const issue of candidates) {
    const state = await get(`/api/issues/${issue.key}/runs`);
    if (state.runs.length) eligible.push({ ...issue, state });
    if (eligible.length === 11) break;
  }
  assert.equal(eligible.length, 11, "The staging check requires eleven real issues with workflow views");
  await page.goto(host);
  const search = async key => {
    await page.getByLabel("Linear issue", { exact: true }).fill(key);
    const response = page.waitForResponse(r => new URL(r.url()).pathname === "/api/issues");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    return (await response).json();
  };
  const sidebar = () => page.locator(".issue-list .issue-key").allTextContents();
  const expected = [];
  for (const issue of eligible) {
    assert.equal((await search(issue.key)).recentIssues.state, "updated");
    expected.unshift(issue.key); expected.splice(10);
  }
  const repeat = eligible[3].key;
  await search(repeat);
  expected.splice(expected.indexOf(repeat), 1); expected.unshift(repeat);
  await page.waitForFunction(keys => JSON.stringify(Array.from(document.querySelectorAll(".issue-list .issue-key"), n => n.textContent)) === JSON.stringify(keys), expected);
  assert.deepEqual(await sidebar(), expected);
  const beforeReload = await get("/api/recent-issues");
  await page.reload();
  await page.waitForFunction(() => document.querySelectorAll(".issue-list .issue-key").length === 10);
  assert.deepEqual(await sidebar(), expected);
  assert.equal((await search("SAC-999999999")).recentIssues.state, "unchanged");
  assert.deepEqual(await get("/api/recent-issues"), beforeReload);
  const saved = beforeReload.items[0];
  const opened = page.waitForResponse(r => new URL(r.url()).pathname === `/api/issues/${saved.issueId}/runs`);
  await page.locator(".issue-list button.issue").first().click();
  const selected = await (await opened).json();
  assert(selected.runs.length > 0);
  await page.waitForFunction(id => document.querySelector("#run")?.value === id, selected.runs[0].id);
  assert.deepEqual(await get("/api/recent-issues"), beforeReload);
  // Completed issues make this check deterministic; active state changes fail conservatively.
  for (const issue of eligible) assert.deepEqual(await get(`/api/issues/${issue.key}/runs`), issue.state);
  assert.equal((await get("/api/version")).sourceSha, sha);
  await mkdir("portal-proof", { recursive: true });
  await page.screenshot({ path: "portal-proof/recent-issues.png", fullPage: true });
  await writeFile("portal-proof/check.json", JSON.stringify({ sourceSha: sha, passed: true, issueCount: 10, checks: ["order", "repeat", "trim", "reload", "ineligible", "stable-id-navigation", "unchanged-run-state"] }, null, 2));
} finally { await browser.close(); }
