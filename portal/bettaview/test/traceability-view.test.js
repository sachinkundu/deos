import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTraceabilityQuality,
  buildTraceabilityView,
  directionalClaimPresentation,
  preferredStatementId,
  requirementJudgmentIsSatisfied,
  sourceRangeLabel,
} from "../src/traceability-view.js";

const proposal = "# Add search\n\n## What Changes\n\n- Add exact search.\n- Add ranked results.\n";
const spec = "## ADDED Requirements\n\n### Requirement: Exact search\nThe system SHALL search exact terms.\n\n#### Scenario: Match\n- **WHEN** a term matches\n- **THEN** return it\n";

function review(version = 3) {
  const manifest = {
    version,
    change: "add-search",
    review: {
      overall: "findings",
      reviewer: { type: "llm", name: "codex-cli", version: "model" },
      documents: [],
    },
    links: [{
      id: "search-exact-terms",
      capability: "search",
      relationship: "supports",
      proposalEvidence: [{ file: "proposal.md", startLine: 5, endLine: 5, quote: "- Add exact search." }],
      spec: { file: "specs/search/spec.md", startLine: 3, endLine: 8 },
      judgment: { coverage: "sufficient", scope: "in_scope", minimality: "minimal", rationale: "Matches." },
    }],
    findings: [{
      id: "ranked-results-missing",
      type: "missing_coverage",
      message: "Ranked results are not specified.",
      capability: "search",
      proposalEvidence: [{ file: "proposal.md", startLine: 6, endLine: 6, quote: "- Add ranked results." }],
      spec: { file: "specs/search/spec.md", startLine: 3, endLine: 8 },
    }],
  };
  if (version >= 3) {
    manifest.proposalStatements = [
      {
        id: "proposal-statement-5",
        proposal: { file: "proposal.md", startLine: 5, endLine: 5, quote: "- Add exact search." },
        requirementLinks: ["search-exact-terms"],
        coverage: "sufficient",
        rationale: "Specified.",
      },
      {
        id: "proposal-statement-6",
        proposal: { file: "proposal.md", startLine: 6, endLine: 6, quote: "- Add ranked results." },
        requirementLinks: [],
        coverage: "missing",
        rationale: "No matching requirement.",
      },
    ];
  }
  if (version === 4) {
    manifest.directionalLinks = [{
      proposalStatementId: "proposal-statement-5",
      requirementLinkId: "search-exact-terms",
      status: "requirement_only",
      proposalFirst: { claimed: false, rationale: "The proposal-first pass did not select it." },
      requirementFirst: { claimed: true, rationale: "The requirement cites this statement." },
    }];
    manifest.proposalStatements[0].requirementLinks = [];
  }
  return {
    path: "openspec/changes/add-search/bettaview-traceability.json",
    change: "add-search",
    version,
    status: "current",
    manifest,
    documents: [
      { file: "proposal.md", path: "openspec/changes/add-search/proposal.md", source: proposal, current: true },
      { file: "specs/search/spec.md", path: "openspec/changes/add-search/specs/search/spec.md", source: spec, current: true },
    ],
  };
}

test("builds a selected proposal-to-spec-to-proposal view from v3", () => {
  const view = buildTraceabilityView(review());
  assert.equal(view.mode, "bidirectional");
  assert.equal(view.summary.missing, 1);
  assert.equal(view.links[0].spec.title, "Exact search");
  assert.match(view.links[0].spec.text, /Scenario: Match/);
  assert.deepEqual(view.links[0].backLinks.map((endpoint) => endpoint.startLine), [5]);
  assert.equal(view.links[0].findings[0].id, "ranked-results-missing");
  assert.equal(view.statements[1].findings[0].id, "ranked-results-missing");
  assert.equal(preferredStatementId(view), "proposal-statement-6");
});

test("summarizes trace quality and retains actionable issue targets", () => {
  const view = buildTraceabilityView(review());
  const quality = buildTraceabilityQuality(view);
  assert.equal(quality.needsAttention, true);
  assert.equal(quality.evidenceCurrent, true);
  assert.equal(quality.satisfiedStatements, 1);
  assert.equal(quality.totalStatements, 2);
  assert.equal(quality.satisfiedRequirements, 1);
  assert.equal(quality.totalRequirements, 1);
  assert.deepEqual(quality.statementIssues.map((statement) => statement.id), ["proposal-statement-6"]);
  assert.deepEqual(quality.findings.map((finding) => finding.id), ["ranked-results-missing"]);
  assert.deepEqual(quality.requirementIssues, []);
});

test("renders a one-sided v4 relationship in both directions without hiding the disagreement", () => {
  const view = buildTraceabilityView(review(4));
  const quality = buildTraceabilityQuality(view);
  assert.equal(view.mode, "directional");
  assert.equal(view.statements[0].requirements[0].id, "search-exact-terms");
  assert.deepEqual(view.links[0].backLinks.map((endpoint) => endpoint.startLine), [5]);
  assert.equal(view.links[0].directionalClaims[0].status, "requirement_only");
  assert.equal(quality.directionalDisagreements.length, 1);
  assert.equal(quality.needsAttention, true);
  assert.deepEqual(directionalClaimPresentation(view.links[0].directionalClaims[0]), {
    label: "Only in requirement",
    details: [{ label: null, rationale: "The requirement cites this statement." }],
  });
});

test("quality summary surfaces an adverse requirement judgment", () => {
  const view = buildTraceabilityView(review());
  view.links[0].judgment.scope = "over_specified";
  const quality = buildTraceabilityQuality(view);
  assert.equal(quality.satisfiedRequirements, 0);
  assert.deepEqual(quality.requirementIssues.map((link) => link.id), ["search-exact-terms"]);
});

test("identifies whether a requirement judgment is fully satisfied", () => {
  const view = buildTraceabilityView(review());
  assert.equal(requirementJudgmentIsSatisfied(view.links[0]), true);
  view.links[0].judgment.coverage = "partial";
  assert.equal(requirementJudgmentIsSatisfied(view.links[0]), false);
});

test("derives proposal evidence groups for a v2 sidecar and labels its limit", () => {
  const view = buildTraceabilityView(review(2));
  const quality = buildTraceabilityQuality(view);
  assert.equal(view.mode, "evidence");
  assert.equal(view.statements.length, 1);
  assert.equal(view.statements[0].requirements[0].id, "search-exact-terms");
  assert.match(view.caveat, /does not inventory every proposal statement/);
  assert.equal(quality.limitedEvidence, true);
  assert.equal(quality.needsAttention, true);
});

test("formats compact line ranges", () => {
  assert.equal(sourceRangeLabel({ file: "proposal.md", startLine: 5, endLine: 5 }), "proposal.md L5");
  assert.equal(sourceRangeLabel({ file: "spec.md", startLine: 3, endLine: 8 }), "spec.md L3–8");
});
