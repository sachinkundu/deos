function sourceText(source, startLine, endLine) {
  if (typeof source !== "string" || !Number.isInteger(startLine) || !Number.isInteger(endLine)) return "";
  return source.split("\n").slice(startLine - 1, endLine).join("\n").trim();
}

function requirementTitle(text, fallback) {
  const heading = text.match(/^#{2,6}\s+Requirement:\s*(.+)$/m);
  return heading?.[1]?.trim() || fallback;
}

function evidenceKey(evidence) {
  return `${evidence.file}:${evidence.startLine}-${evidence.endLine}`;
}

function rangesOverlap(left, right) {
  return left.file === right.file && left.startLine <= right.endLine && right.startLine <= left.endLine;
}

function v2Coverage(requirementLinks, linksById) {
  const values = requirementLinks.map((id) => linksById.get(id)?.judgment?.coverage);
  if (values.every((value) => value === "sufficient")) return "sufficient";
  return values.some((value) => value && value !== "missing") ? "partial" : "missing";
}

export function sourceRangeLabel(endpoint) {
  if (!endpoint) return "Unknown source";
  const range = endpoint.startLine === endpoint.endLine
    ? `L${endpoint.startLine}`
    : `L${endpoint.startLine}–${endpoint.endLine}`;
  return `${endpoint.file} ${range}`;
}

export function requirementJudgmentIsSatisfied(link) {
  return link.judgment.coverage === "sufficient"
    && link.judgment.scope === "in_scope"
    && link.judgment.minimality === "minimal";
}

export function directionalClaimPresentation(claim) {
  const proposalRationale = claim?.proposalFirst?.rationale || "No rationale";
  const requirementRationale = claim?.requirementFirst?.rationale || "No rationale";
  if (claim?.status === "proposal_only") return {
    label: "Only in proposal",
    details: [{ label: null, rationale: proposalRationale }],
  };
  if (claim?.status === "requirement_only") return {
    label: "Only in requirement",
    details: [{ label: null, rationale: requirementRationale }],
  };
  return {
    label: claim?.status === "confirmed" ? "In proposal and requirement" : "Relationship evidence",
    details: [
      { label: "Proposal", rationale: proposalRationale },
      { label: "Requirement", rationale: requirementRationale },
    ],
  };
}

export function buildTraceabilityView(review) {
  if (!review?.manifest) throw new Error("A loaded traceability review is required.");
  const manifest = review.manifest;
  const documentsByFile = new Map(review.documents.map((document) => [document.file, document]));
  const resolveEndpoint = (endpoint, { quote = false } = {}) => {
    const document = documentsByFile.get(endpoint.file);
    return {
      ...endpoint,
      path: document?.path || null,
      text: quote ? endpoint.quote : sourceText(document?.source, endpoint.startLine, endpoint.endLine),
    };
  };

  const links = manifest.links.map((link) => {
    const spec = resolveEndpoint(link.spec);
    return {
      ...link,
      spec: { ...spec, title: requirementTitle(spec.text, link.id) },
      proposalEvidence: link.proposalEvidence.map((evidence) => resolveEndpoint(evidence, { quote: true })),
      statementIds: [],
      directionalClaims: [],
    };
  });
  const linksById = new Map(links.map((link) => [link.id, link]));

  let statements;
  if (manifest.version >= 3) {
    statements = manifest.proposalStatements.map((statement) => ({
      ...statement,
      proposal: resolveEndpoint(statement.proposal, { quote: true }),
      directionalClaims: [],
    }));
  } else {
    const grouped = new Map();
    for (const link of links) {
      for (const evidence of link.proposalEvidence) {
        const key = evidenceKey(evidence);
        const statement = grouped.get(key) || {
          id: `proposal-evidence-${evidence.startLine}-${evidence.endLine}`,
          proposal: evidence,
          requirementLinks: [],
        };
        if (!statement.requirementLinks.includes(link.id)) statement.requirementLinks.push(link.id);
        grouped.set(key, statement);
      }
    }
    statements = [...grouped.values()].map((statement) => ({
      ...statement,
      coverage: v2Coverage(statement.requirementLinks, linksById),
      rationale: "This exact proposal passage is cited by the linked requirement reviews.",
    }));
  }

  if (manifest.version === 4) {
    const statementsById = new Map(statements.map((statement) => [statement.id, statement]));
    for (const statement of statements) {
      statement.proposalFirstRequirementLinks = [...statement.requirementLinks];
      statement.requirementLinks = [];
    }
    for (const claim of manifest.directionalLinks) {
      const statement = statementsById.get(claim.proposalStatementId);
      const link = linksById.get(claim.requirementLinkId);
      if (!statement || !link) continue;
      const resolved = { ...claim, proposal: statement.proposal, requirement: link };
      statement.directionalClaims.push(resolved);
      link.directionalClaims.push(resolved);
      if (!statement.requirementLinks.includes(link.id)) statement.requirementLinks.push(link.id);
    }
  }

  for (const statement of statements) {
    statement.requirements = statement.requirementLinks.map((id) => linksById.get(id)).filter(Boolean);
    for (const link of statement.requirements) link.statementIds.push(statement.id);
  }

  const statementsById = new Map(statements.map((statement) => [statement.id, statement]));
  for (const link of links) {
    link.backLinks = link.statementIds.map((id) => statementsById.get(id)?.proposal).filter(Boolean);
  }

  const findings = (manifest.findings || []).map((finding) => {
    const proposalEvidence = finding.proposalEvidence.map((evidence) => resolveEndpoint(evidence, { quote: true }));
    const spec = resolveEndpoint(finding.spec);
    const statementIds = statements
      .filter((statement) => proposalEvidence.some((evidence) => rangesOverlap(statement.proposal, evidence)))
      .map((statement) => statement.id);
    const linkIds = links
      .filter((link) => rangesOverlap(link.spec, spec))
      .map((link) => link.id);
    return { ...finding, proposalEvidence, spec, statementIds, linkIds };
  });

  for (const statement of statements) {
    statement.findings = findings.filter((finding) => finding.statementIds.includes(statement.id));
  }
  for (const link of links) {
    link.findings = findings.filter((finding) => finding.linkIds.includes(link.id));
  }

  return {
    path: review.path,
    change: review.change,
    version: review.version,
    status: review.status,
    review: manifest.review,
    documents: review.documents,
    statements,
    links,
    findings,
    summary: {
      sufficient: statements.filter((statement) => statement.coverage === "sufficient").length,
      partial: statements.filter((statement) => statement.coverage === "partial").length,
      missing: statements.filter((statement) => statement.coverage === "missing").length,
      requirements: links.length,
      findings: findings.length,
      disputedLinks: manifest.version === 4
        ? manifest.directionalLinks.filter((link) => link.status !== "confirmed").length
        : 0,
    },
    mode: manifest.version === 4 ? "directional" : manifest.version === 3 ? "bidirectional" : "evidence",
    caveat: manifest.version === 4
      ? "Two fresh semantic passes are shown separately. Confirmed and one-sided links remain model opinions."
      : manifest.version === 3
        ? "The sidecar proves current evidence and bidirectional coverage structure; semantic coverage remains the reviewer's opinion."
      : "Version 2 links requirements back to exact proposal evidence, but does not inventory every proposal statement.",
  };
}

export function buildTraceabilityQuality(view) {
  if (!view) throw new Error("A traceability view is required.");
  const staleDocuments = view.documents.filter((document) => !document.current);
  const statementIssues = view.statements.filter((statement) => statement.coverage !== "sufficient");
  const requirementIssues = view.links.filter((link) => !requirementJudgmentIsSatisfied(link));
  const directionalDisagreements = view.links.flatMap((link) => link.directionalClaims || [])
    .filter((claim) => claim.status !== "confirmed");
  const satisfiedRequirements = view.links.filter(requirementJudgmentIsSatisfied).length;
  return {
    status: view.status,
    evidenceCurrent: view.status === "current" && staleDocuments.length === 0,
    limitedEvidence: !["bidirectional", "directional"].includes(view.mode),
    directionalDisagreements,
    statementIssues,
    requirementIssues,
    findings: view.findings,
    staleDocuments,
    satisfiedStatements: view.summary.sufficient,
    totalStatements: view.statements.length,
    satisfiedRequirements,
    totalRequirements: view.links.length,
    needsAttention: view.status !== "current"
      || !["bidirectional", "directional"].includes(view.mode)
      || directionalDisagreements.length > 0
      || statementIssues.length > 0
      || requirementIssues.length > 0
      || view.findings.length > 0,
  };
}

export function preferredStatementId(view) {
  return view.statements.find((statement) => statement.coverage !== "sufficient")?.id
    || view.statements[0]?.id
    || null;
}
