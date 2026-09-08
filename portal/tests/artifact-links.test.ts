import test from "node:test";
import assert from "node:assert/strict";
import { stageArtifactLinks } from "../src/artifact-links.ts";
const product = { repository: "owner/repo", change_id: "sample", head_sha: "abc123", merge_commit_sha: null, planning_manifest_json: JSON.stringify([{path: "openspec/changes/sample/proposal.md"}, {path: "openspec/changes/sample/specs/notifications/spec.md"}, {path: "openspec/changes/sample/.openspec.yaml"}]) };
test("planning links each published artifact and switches to main after merge", () => {
  const links = stageArtifactLinks(product, "planning");
  assert.deepEqual(links.map(link => link.label), ["Proposal", "Spec: notifications"]);
  assert.ok(links.every(link => link.url.includes("/blob/abc123/")));
  assert.ok(stageArtifactLinks({...product, merge_commit_sha: "merged"}, "planning").every(link => link.url.includes("/blob/main/")));
});
test("design links design.md on its published head or main after merge", () => {
  assert.equal(stageArtifactLinks(product, "design")[0].url, "https://github.com/owner/repo/blob/abc123/openspec/changes/sample/design.md");
  assert.ok(stageArtifactLinks({...product, merge_commit_sha: "merged"}, "design")[0].url.includes("/blob/main/"));
  assert.deepEqual(stageArtifactLinks({...product, head_sha: null}, "design"), []);
});
