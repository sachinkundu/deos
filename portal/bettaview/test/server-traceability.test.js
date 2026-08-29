import test from "node:test";
import assert from "node:assert/strict";
import { fingerprint } from "../server/github.js";
import {
  findOpenSpecTraceabilityTargets,
  isTraceabilitySidecar,
  loadTraceabilityReview,
  resolveTraceabilityDocumentPath,
} from "../server/traceability.js";

test("detects an eligible OpenSpec traceability target without blocking PR loading", () => {
  const root = "openspec/changes/add-search";
  const targets = findOpenSpecTraceabilityTargets([
    {
      path: `${root}/proposal.md`,
      source: "## What Changes\n\n- Add search.\n\n## Capabilities\n\n- `search`: Search rules.\n",
    },
    {
      path: `${root}/specs/search/spec.md`,
      source: "## ADDED Requirements\n\n### Requirement: Search\nThe system SHALL search.\n",
    },
  ]);

  assert.deepEqual(targets, [{
    change: "add-search",
    rootPath: root,
    proposalPath: `${root}/proposal.md`,
    specPaths: [`${root}/specs/search/spec.md`],
    capabilityCount: 1,
    requirementReady: true,
    eligible: true,
    reason: null,
  }]);
});

test("explains why an OpenSpec-shaped PR is not traceable", () => {
  const targets = findOpenSpecTraceabilityTargets([{
    path: "openspec/changes/add-search/specs/search/spec.md",
    source: "### Requirement: Search\nThe system SHALL search.\n",
  }]);

  assert.equal(targets[0].eligible, false);
  assert.match(targets[0].reason, /does not include proposal\.md/);
});

test("discovers only live sidecars at OpenSpec change roots", () => {
  assert.equal(isTraceabilitySidecar({ filename: "openspec/changes/add-search/bettaview-traceability.json", status: "added" }), true);
  assert.equal(isTraceabilitySidecar({ filename: "evidence/bettaview-traceability.json", status: "added" }), false);
  assert.equal(isTraceabilitySidecar({ filename: "openspec/changes/add-search/bettaview-traceability.json", status: "removed" }), false);
});

test("resolves reviewed documents inside the sidecar change root", () => {
  assert.equal(
    resolveTraceabilityDocumentPath("openspec/changes/add-search/bettaview-traceability.json", "specs/search/spec.md"),
    "openspec/changes/add-search/specs/search/spec.md",
  );
  assert.throws(
    () => resolveTraceabilityDocumentPath("openspec/changes/add-search/bettaview-traceability.json", "../proposal.md"),
    /leaves the OpenSpec change/,
  );
});

test("loads a sidecar and verifies pinned documents at the exact head", async () => {
  const files = {
    "openspec/changes/add-search/proposal.md": "# Change\n",
    "openspec/changes/add-search/specs/search/spec.md": "### Requirement: Search\nThe system SHALL search.\n",
  };
  const manifest = {
    version: 3,
    change: "add-search",
    review: {
      documents: Object.entries(files).map(([repositoryPath, source]) => ({
        file: repositoryPath.replace("openspec/changes/add-search/", ""),
        sha256: fingerprint(source),
      })),
    },
    links: [],
    proposalStatements: [],
  };
  files["openspec/changes/add-search/bettaview-traceability.json"] = JSON.stringify(manifest);
  const loads = [];
  const review = await loadTraceabilityReview(
    { filename: "openspec/changes/add-search/bettaview-traceability.json", status: "added" },
    "exact-head",
    async (repositoryPath, ref) => {
      loads.push([repositoryPath, ref]);
      return files[repositoryPath];
    },
  );

  assert.equal(review.status, "current");
  assert.equal(review.documents.length, 2);
  assert.deepEqual(loads.map(([, ref]) => ref), ["exact-head", "exact-head", "exact-head"]);
});

test("marks the review stale when a pinned document changed", async () => {
  const sidecarPath = "openspec/changes/add-search/bettaview-traceability.json";
  const manifest = {
    version: 2,
    change: "add-search",
    review: { documents: [{ file: "proposal.md", sha256: fingerprint("old") }] },
    links: [],
  };
  const review = await loadTraceabilityReview(
    { filename: sidecarPath, status: "modified" },
    "head",
    async (repositoryPath) => repositoryPath === sidecarPath ? JSON.stringify(manifest) : "new",
  );
  assert.equal(review.status, "stale");
  assert.equal(review.documents[0].current, false);
});

test("rejects a sidecar that cannot be rendered safely", async () => {
  const sidecarPath = "openspec/changes/add-search/bettaview-traceability.json";
  const manifest = {
    version: 3,
    change: "add-search",
    review: { documents: [{ file: "proposal.md", sha256: fingerprint("proposal") }] },
    links: [{ id: "malformed" }],
    proposalStatements: [],
  };
  await assert.rejects(
    loadTraceabilityReview(
      { filename: sidecarPath, status: "added" },
      "head",
      async (repositoryPath) => repositoryPath === sidecarPath ? JSON.stringify(manifest) : "proposal",
    ),
    /links\[0\]\.spec must be an object/,
  );
});
