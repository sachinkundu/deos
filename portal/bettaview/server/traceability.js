import { posix as path } from "node:path";
import { fingerprint } from "./github.js";
import { proposalCapabilityDeclarations, splitSourceLines } from "../src/traceability.js";

const SIDECAR_NAME = "bettaview-traceability.json";
const CHANGE_SIDECAR_PATTERN = /^openspec\/changes\/[^/]+\/bettaview-traceability\.json$/;
const CHANGE_PROPOSAL_PATTERN = /^openspec\/changes\/([^/]+)\/proposal\.md$/;
const CHANGE_SPEC_PATTERN = /^openspec\/changes\/([^/]+)\/specs\/(.+)\/spec\.md$/;

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
}

export function isTraceabilitySidecar(file) {
  return file?.status !== "removed" && CHANGE_SIDECAR_PATTERN.test(file?.filename || "");
}

function filePath(file) {
  return file?.path || file?.filename || "";
}

export function findOpenSpecTraceabilityTargets(files) {
  const changes = new Map();
  for (const file of files || []) {
    if (file?.status === "removed") continue;
    const repositoryPath = filePath(file);
    const proposalMatch = repositoryPath.match(CHANGE_PROPOSAL_PATTERN);
    const specMatch = repositoryPath.match(CHANGE_SPEC_PATTERN);
    const match = proposalMatch || specMatch;
    if (!match) continue;
    const change = match[1];
    const target = changes.get(change) || {
      change,
      rootPath: `openspec/changes/${change}`,
      proposal: null,
      specs: [],
    };
    if (proposalMatch) target.proposal = file;
    if (specMatch) target.specs.push(file);
    changes.set(change, target);
  }

  return [...changes.values()].sort((left, right) => left.change.localeCompare(right.change)).map((target) => {
    const proposalPath = `${target.rootPath}/proposal.md`;
    const specPaths = target.specs.map(filePath).sort();
    const summary = { change: target.change, rootPath: target.rootPath, proposalPath, specPaths };
    if (!target.proposal) {
      return { ...summary, eligible: false, reason: "The pull request does not include proposal.md for this OpenSpec change." };
    }
    if (typeof target.proposal.source !== "string") {
      return { ...summary, eligible: false, reason: "BettaView could not read proposal.md at the pull request head." };
    }
    const capabilities = proposalCapabilityDeclarations(splitSourceLines(target.proposal.source));
    if (!capabilities.length) {
      return { ...summary, eligible: false, reason: "proposal.md has no supported capability declarations under ## Capabilities." };
    }
    const expectedSpecPaths = capabilities.map(({ path: capability }) => `${target.rootPath}/specs/${capability}/spec.md`).sort();
    const actualSpecPaths = specPaths;
    if (JSON.stringify(actualSpecPaths) !== JSON.stringify(expectedSpecPaths)) {
      return { ...summary, eligible: false, reason: `Changed spec files do not exactly match the proposal capabilities (expected: ${expectedSpecPaths.join(", ") || "none"}).` };
    }
    const missingRequirement = target.specs.find((file) => (
      typeof file.source !== "string"
      || !splitSourceLines(file.source).some((line) => /^### Requirement: \S/.test(line))
    ));
    if (missingRequirement) {
      return { ...summary, eligible: false, reason: `${filePath(missingRequirement)} has no supported Requirement blocks.` };
    }
    return {
      change: target.change,
      rootPath: target.rootPath,
      proposalPath,
      specPaths: actualSpecPaths,
      capabilityCount: capabilities.length,
      requirementReady: true,
      eligible: true,
      reason: null,
    };
  });
}

export function resolveTraceabilityDocumentPath(sidecarPath, documentPath) {
  if (typeof documentPath !== "string" || !documentPath || path.isAbsolute(documentPath)) {
    throw new Error("Traceability document paths must be non-empty relative paths.");
  }
  const normalized = path.normalize(documentPath);
  if (normalized === ".." || normalized.startsWith("../")) {
    throw new Error(`Traceability document leaves the OpenSpec change: ${documentPath}`);
  }
  return path.join(path.dirname(sidecarPath), normalized);
}

export async function loadTraceabilityReview(file, ref, loadFile) {
  if (!isTraceabilitySidecar(file)) throw new Error(`${file?.filename || SIDECAR_NAME} is not an OpenSpec change sidecar.`);
  const source = await loadFile(file.filename, ref);
  let manifest;
  try {
    manifest = JSON.parse(source);
  } catch {
    throw new Error(`${file.filename} is not valid JSON.`);
  }
  assertPlainObject(manifest, file.filename);
  if (![2, 3, 4].includes(manifest.version)) {
    throw new Error(`${file.filename} uses unsupported traceability version ${JSON.stringify(manifest.version)}.`);
  }
  assertPlainObject(manifest.review, `${file.filename}.review`);
  if (!Array.isArray(manifest.review.documents) || manifest.review.documents.length === 0) {
    throw new Error(`${file.filename}.review.documents must list the reviewed OpenSpec documents.`);
  }
  if (!Array.isArray(manifest.links)) throw new Error(`${file.filename}.links must be an array.`);
  if (manifest.version >= 3 && !Array.isArray(manifest.proposalStatements)) {
    throw new Error(`${file.filename}.proposalStatements must be an array for version ${manifest.version}.`);
  }
  if (manifest.version === 4 && !Array.isArray(manifest.directionalLinks)) {
    throw new Error(`${file.filename}.directionalLinks must be an array for version 4.`);
  }
  if (manifest.findings !== undefined && !Array.isArray(manifest.findings)) {
    throw new Error(`${file.filename}.findings must be an array.`);
  }
  manifest.links.forEach((link, index) => {
    assertPlainObject(link, `${file.filename}.links[${index}]`);
    assertPlainObject(link.spec, `${file.filename}.links[${index}].spec`);
    assertPlainObject(link.judgment, `${file.filename}.links[${index}].judgment`);
    if (!Array.isArray(link.proposalEvidence)) {
      throw new Error(`${file.filename}.links[${index}].proposalEvidence must be an array.`);
    }
  });
  (manifest.proposalStatements || []).forEach((statement, index) => {
    assertPlainObject(statement, `${file.filename}.proposalStatements[${index}]`);
    assertPlainObject(statement.proposal, `${file.filename}.proposalStatements[${index}].proposal`);
    if (!Array.isArray(statement.requirementLinks)) {
      throw new Error(`${file.filename}.proposalStatements[${index}].requirementLinks must be an array.`);
    }
  });
  (manifest.findings || []).forEach((finding, index) => {
    assertPlainObject(finding, `${file.filename}.findings[${index}]`);
    assertPlainObject(finding.spec, `${file.filename}.findings[${index}].spec`);
    if (!Array.isArray(finding.proposalEvidence)) {
      throw new Error(`${file.filename}.findings[${index}].proposalEvidence must be an array.`);
    }
  });

  const documents = await Promise.all(manifest.review.documents.map(async (document, index) => {
    assertPlainObject(document, `${file.filename}.review.documents[${index}]`);
    if (typeof document.file !== "string" || typeof document.sha256 !== "string") {
      throw new Error(`${file.filename}.review.documents[${index}] must contain file and sha256.`);
    }
    const repositoryPath = resolveTraceabilityDocumentPath(file.filename, document.file);
    const documentSource = await loadFile(repositoryPath, ref);
    const actualSha256 = fingerprint(documentSource);
    return {
      file: document.file,
      path: repositoryPath,
      source: documentSource,
      expectedSha256: document.sha256,
      actualSha256,
      current: actualSha256 === document.sha256,
    };
  }));

  return {
    path: file.filename,
    rootPath: path.dirname(file.filename),
    version: manifest.version,
    change: manifest.change,
    status: documents.every((document) => document.current) ? "current" : "stale",
    manifest,
    documents,
  };
}
