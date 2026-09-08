import test from "node:test";
import assert from "node:assert/strict";
import { cleanRenderedMarkdown } from "../worker/github-api.js";
const context = {owner: "owner", repo: "repo", path: "openspec/changes/example/design.md", ref: "abc123"};
test("relative document links use the source folder and reviewed revision", () => {
  const html = cleanRenderedMarkdown('<a href="proposal.md">Proposal</a><a href="specs/workflow/spec.md#details">Spec</a>', context);
  assert.ok(html.includes('href="https://github.com/owner/repo/blob/abc123/openspec/changes/example/proposal.md"'));
  assert.ok(html.includes('href="https://github.com/owner/repo/blob/abc123/openspec/changes/example/specs/workflow/spec.md#details"'));
});
test("parent and root paths resolve in the repository while external links and anchors stay intact", () => {
  const html = cleanRenderedMarkdown('<a href="../proposal.md">Parent</a><a href="/README.md">Root</a><a href="#section">Anchor</a><a href="https://example.com">External</a><a href="javascript:alert(1)">Unsafe</a>', context);
  assert.ok(html.includes('/blob/abc123/openspec/changes/proposal.md'));
  assert.ok(html.includes('/blob/abc123/README.md'));
  assert.ok(html.includes('href="#section"'));
  assert.ok(html.includes('href="https://example.com"'));
  assert.ok(!html.includes('javascript:'));
});
