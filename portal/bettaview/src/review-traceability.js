import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import {
  copyFile,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  loadTraceability,
  proposalCapabilityDeclarations,
  proposalChangeStatements,
  splitSourceLines,
} from "./traceability.js";

const PROMPT_VERSION = "openspec-semantic-traceability-bidirectional-v2";
const promptFile = fileURLToPath(new URL(`../prompts/${PROMPT_VERSION}.md`, import.meta.url));
const schemaFile = fileURLToPath(new URL(`../prompts/${PROMPT_VERSION}.schema.json`, import.meta.url));
export const DIRECTIONAL_PROMPT_VERSION = "openspec-semantic-traceability-directional-v3";
const directionalPasses = {
  proposal_to_spec: {
    promptFile: fileURLToPath(new URL("../prompts/openspec-semantic-traceability-proposal-first-v1.md", import.meta.url)),
    schemaFile: fileURLToPath(new URL("../prompts/openspec-semantic-traceability-proposal-first-v1.schema.json", import.meta.url)),
  },
  spec_to_proposal: {
    promptFile: fileURLToPath(new URL("../prompts/openspec-semantic-traceability-requirement-first-v1.md", import.meta.url)),
    schemaFile: fileURLToPath(new URL("../prompts/openspec-semantic-traceability-requirement-first-v1.schema.json", import.meta.url)),
  },
};
const materializerFile = fileURLToPath(new URL("../bin/materialize-traceability.js", import.meta.url));

function sha256(source) {
  return createHash("sha256").update(source).digest("hex");
}

function numberedSource(source) {
  return splitSourceLines(source)
    .map((line, index) => `${String(index + 1).padStart(5, " ")} | ${line}`)
    .join("\n");
}

async function listSpecFiles(changeDirectory) {
  const files = [];
  async function visit(directory) {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error?.code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      const candidate = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(candidate);
      if (entry.isFile() && entry.name === "spec.md") {
        files.push(path.relative(changeDirectory, candidate));
      }
    }
  }
  await visit(path.join(changeDirectory, "specs"));
  return files.sort();
}

export async function inventoryOpenSpecChange(changeDirectoryArgument) {
  const changeDirectory = await realpath(path.resolve(changeDirectoryArgument));
  const proposalSource = await readFile(path.join(changeDirectory, "proposal.md"), "utf8");
  const capabilities = proposalCapabilityDeclarations(splitSourceLines(proposalSource));
  if (capabilities.length === 0) {
    throw new Error("proposal.md has no capability declarations under ## Capabilities");
  }

  const expectedSpecFiles = capabilities.map(({ path: capabilityPath }) => (
    `specs/${capabilityPath}/spec.md`
  )).sort();
  const actualSpecFiles = await listSpecFiles(changeDirectory);
  if (JSON.stringify(actualSpecFiles) !== JSON.stringify(expectedSpecFiles)) {
    throw new Error(`Spec files do not exactly match proposal capabilities (expected: ${expectedSpecFiles.join(", ")}; found: ${actualSpecFiles.join(", ")})`);
  }

  const documents = [{
    file: "proposal.md",
    source: proposalSource,
    sha256: sha256(proposalSource),
  }];
  const requirements = [];
  for (const file of expectedSpecFiles) {
    const source = await readFile(path.join(changeDirectory, file), "utf8");
    const requirementLines = splitSourceLines(source)
      .flatMap((line, index) => (/^### Requirement: \S/.test(line) ? [index + 1] : []));
    if (requirementLines.length === 0) {
      throw new Error(`${file} has no Requirement blocks`);
    }
    const capability = file.slice("specs/".length, -"/spec.md".length);
    for (const specStartLine of requirementLines) {
      requirements.push({
        id: `${capability.replaceAll("/", "-")}-requirement-${specStartLine}`,
        capability,
        specFile: file,
        specStartLine,
      });
    }
    documents.push({ file, source, sha256: sha256(source) });
  }

  return {
    changeDirectory,
    change: path.basename(changeDirectory),
    documents,
    proposalStatements: proposalChangeStatements(splitSourceLines(proposalSource)),
    requirements,
  };
}

export function buildDirectionalJudgePrompt({
  inventory,
  instructions,
  direction,
  repair,
}) {
  if (!Object.hasOwn(directionalPasses, direction)) throw new Error(`Unknown traceability direction: ${direction}`);
  const capabilityDeclarations = proposalCapabilityDeclarations(
    splitSourceLines(inventory.documents[0].source),
  );
  const identityInventory = [
    "## Host-supplied identity inventory",
    "",
    "Capabilities:",
    ...capabilityDeclarations.map((capability) =>
      `- ${capability.path}: proposal.md:${capability.startLine}`),
    "",
    "Proposal statements:",
    ...inventory.proposalStatements.map((statement) =>
      `- proposal.md:${statement.startLine}-${statement.endLine}`),
    "",
    "Requirements:",
    ...inventory.requirements.map((requirement) =>
      `- ${requirement.id}: ${requirement.specFile}:${requirement.specStartLine} (${requirement.capability})`),
  ];
  const repairContext = repair ? [
    "",
    "## Deterministic form correction",
    "",
    "Correct only the malformed source identity, missing inventory item, duplicate, or invalid value named below.",
    "Do not change a valid semantic claim merely to make it agree with the other direction.",
    `Error: ${repair.error}`,
    "Previous result:",
    JSON.stringify(repair.judgment, null, 2),
  ] : [];
  const sources = inventory.documents.flatMap((document) => [
    "",
    `## Immutable source: ${document.file}`,
    "",
    `SHA-256: ${document.sha256}`,
    "",
    numberedSource(document.source),
  ]);
  return [instructions.trim(), "", ...identityInventory, ...repairContext, ...sources, ""].join("\n");
}

export function buildJudgePrompt({ inventory, instructions, reviewerVersion, reviewedAt, repair }) {
  const hostValues = [
    "## Host-supplied values",
    "",
    `- change: ${JSON.stringify(inventory.change)}`,
    "- review.kind: \"semantic-spec-review\"",
    "- review.reviewer.type: \"llm\"",
    "- review.reviewer.name: \"codex-cli\"",
    `- review.reviewer.version: ${JSON.stringify(reviewerVersion)}`,
    `- review.promptVersion: ${JSON.stringify(PROMPT_VERSION)}`,
    `- review.reviewedAt: ${JSON.stringify(reviewedAt)}`,
    "",
    "Use these exact host values in the structured response. The host will overwrite them before acceptance.",
  ];
  const repairContext = repair ? [
    "",
    "## Deterministic rejection to repair",
    "",
    "The previous candidate was rejected by the materializer or validator. Correct the line-ID judgment using the exact error and sources below. Do not weaken or reinterpret the validator.",
    "",
    `Error: ${repair.error}`,
    "",
    "Previous candidate:",
    JSON.stringify(repair.judgment, null, 2),
  ] : [];
  const sources = inventory.documents.flatMap((document) => [
    "",
    `## Immutable source: ${document.file}`,
    "",
    `SHA-256: ${document.sha256}`,
    "",
    numberedSource(document.source),
  ]);
  return [instructions.trim(), "", ...hostValues, ...repairContext, ...sources, ""].join("\n");
}

function isPassingJudgment(judgment) {
  return judgment?.coverage === "sufficient"
    && judgment?.scope === "in_scope"
    && judgment?.minimality === "minimal";
}

export function normalizeJudgment(judgment, { change, reviewerVersion, reviewedAt }) {
  if (judgment === null || typeof judgment !== "object" || Array.isArray(judgment)) {
    throw new Error("Codex did not return a JSON object");
  }
  const normalized = structuredClone(judgment);
  normalized.change = change;
  const capabilities = Array.isArray(normalized.capabilities) ? normalized.capabilities : [];
  const proposalStatements = Array.isArray(normalized.proposalStatements) ? normalized.proposalStatements : [];
  const findings = Array.isArray(normalized.findings) ? normalized.findings : [];
  const allJudgmentsPass = capabilities.every((capability) => (
    isPassingJudgment(capability.judgment)
      && Array.isArray(capability.links)
      && capability.links.every((link) => isPassingJudgment(link.judgment))
  ));
  const allStatementsPass = proposalStatements.every((statement) => statement.coverage === "sufficient");
  const overall = findings.length === 0 && allJudgmentsPass && allStatementsPass
    ? "pass"
    : "findings";
  normalized.review = {
    kind: "semantic-spec-review",
    reviewer: { type: "llm", name: "codex-cli", version: reviewerVersion },
    promptVersion: PROMPT_VERSION,
    reviewedAt,
    overall,
  };
  return normalized;
}

function assertObject(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

function assertExactValues(actual, expected, label) {
  const sortedActual = [...actual].sort();
  const sortedExpected = [...expected].sort();
  if (JSON.stringify(sortedActual) !== JSON.stringify(sortedExpected)) {
    throw new Error(
      `${label} must exactly match the trusted inventory (expected: ${sortedExpected.join(", ")}; received: ${sortedActual.join(", ")})`,
    );
  }
}

export function validateDirectionalJudgment(direction, judgment, inventory) {
  assertObject(judgment, `${direction} result`);
  const requirementById = new Map(inventory.requirements.map((requirement) => [requirement.id, requirement]));
  if (direction === "proposal_to_spec") {
    if (!Array.isArray(judgment.proposalStatements)) throw new Error("proposal-first result must include proposalStatements");
    assertExactValues(
      judgment.proposalStatements.map((statement) => statement.proposalLine),
      inventory.proposalStatements.map((statement) => statement.startLine),
      "proposal-first statement lines",
    );
    for (const value of judgment.proposalStatements) {
      const statement = assertObject(value, "proposal-first statement");
      if (!Array.isArray(statement.requirementLinkIds)) throw new Error("proposal-first requirementLinkIds must be an array");
      if (new Set(statement.requirementLinkIds).size !== statement.requirementLinkIds.length) {
        throw new Error(`proposal statement ${statement.proposalLine} repeats a requirement claim`);
      }
      for (const id of statement.requirementLinkIds) {
        if (!requirementById.has(id)) throw new Error(`proposal statement ${statement.proposalLine} names unknown requirement ${id}`);
      }
      if (!["sufficient", "partial", "missing"].includes(statement.coverage)) {
        throw new Error(`proposal statement ${statement.proposalLine} has invalid coverage`);
      }
      if (typeof statement.rationale !== "string" || statement.rationale.length === 0) {
        throw new Error(`proposal statement ${statement.proposalLine} needs a rationale`);
      }
      if (statement.coverage === "missing" && statement.requirementLinkIds.length !== 0) {
        throw new Error(`missing proposal statement ${statement.proposalLine} cannot claim a requirement`);
      }
      if (statement.coverage !== "missing" && statement.requirementLinkIds.length === 0) {
        throw new Error(`${statement.coverage} proposal statement ${statement.proposalLine} must claim a requirement`);
      }
    }
    return judgment;
  }
  if (direction !== "spec_to_proposal") throw new Error(`Unknown traceability direction: ${direction}`);
  if (!Array.isArray(judgment.capabilities)) throw new Error("requirement-first result must include capabilities");
  const declarations = proposalCapabilityDeclarations(splitSourceLines(inventory.documents[0].source));
  assertExactValues(
    judgment.capabilities.map((capability) => capability.path),
    declarations.map((declaration) => declaration.path),
    "requirement-first capabilities",
  );
  const observedRequirements = [];
  for (const value of judgment.capabilities) {
    const capability = assertObject(value, "requirement-first capability");
    const declaration = declarations.find((candidate) => candidate.path === capability.path);
    if (capability.capabilityLine !== declaration.startLine) {
      throw new Error(`capability ${capability.path} must cite proposal line ${declaration.startLine}`);
    }
    if (!Array.isArray(capability.links)) throw new Error(`capability ${capability.path} must include links`);
    for (const valueLink of capability.links) {
      const link = assertObject(valueLink, `capability ${capability.path} link`);
      const expected = requirementById.get(link.id);
      if (!expected || expected.capability !== capability.path || expected.specStartLine !== link.specStartLine) {
        throw new Error(`requirement-first result names unknown requirement ${link.id}`);
      }
      if (!Array.isArray(link.proposalLines) || link.proposalLines.length === 0) {
        throw new Error(`requirement ${link.id} must cite proposal lines`);
      }
      observedRequirements.push(link.id);
    }
  }
  assertExactValues(observedRequirements, inventory.requirements.map((requirement) => requirement.id), "requirement-first requirements");
  if (!Array.isArray(judgment.findings)) throw new Error("requirement-first result must include findings");
  return judgment;
}

export function normalizeDirectionalJudgments(
  { proposalFirst, requirementFirst },
  { inventory, reviewerVersion, reviewedAt },
) {
  validateDirectionalJudgment("proposal_to_spec", proposalFirst, inventory);
  validateDirectionalJudgment("spec_to_proposal", requirementFirst, inventory);
  const proposalStatements = structuredClone(proposalFirst.proposalStatements);
  const capabilities = structuredClone(requirementFirst.capabilities);
  const requirementLinks = capabilities.flatMap((capability) => capability.links);
  const requirementById = new Map(requirementLinks.map((link) => [link.id, link]));
  const statementByLine = new Map(inventory.proposalStatements.map((statement) => [statement.startLine, statement]));
  const proposalClaims = new Set();
  for (const statement of proposalStatements) {
    for (const linkId of statement.requirementLinkIds) proposalClaims.add(`${statement.proposalLine}\0${linkId}`);
  }
  const requirementClaims = new Set();
  for (const link of requirementLinks) {
    for (const statement of inventory.proposalStatements) {
      if (link.proposalLines.some((line) => line >= statement.startLine && line <= statement.endLine)) {
        requirementClaims.add(`${statement.startLine}\0${link.id}`);
      }
    }
  }
  const directionalLinks = [...new Set([...proposalClaims, ...requirementClaims])]
    .map((key) => {
      const [proposalLineText, requirementLinkId] = key.split("\0");
      const proposalLine = Number(proposalLineText);
      const statement = proposalStatements.find((candidate) => candidate.proposalLine === proposalLine);
      const requirement = requirementById.get(requirementLinkId);
      const proposalClaimed = proposalClaims.has(key);
      const requirementClaimed = requirementClaims.has(key);
      return {
        proposalLine,
        requirementLinkId,
        status: proposalClaimed && requirementClaimed
          ? "confirmed"
          : proposalClaimed ? "proposal_only" : "requirement_only",
        proposalFirst: {
          claimed: proposalClaimed,
          rationale: proposalClaimed ? statement.rationale : "The proposal-first pass did not claim this relationship.",
        },
        requirementFirst: {
          claimed: requirementClaimed,
          rationale: requirementClaimed ? requirement.judgment.rationale : "The requirement-first pass did not claim this relationship.",
        },
      };
    })
    .sort((left, right) => left.proposalLine - right.proposalLine
      || left.requirementLinkId.localeCompare(right.requirementLinkId));
  for (const link of directionalLinks) {
    if (!statementByLine.has(link.proposalLine) || !requirementById.has(link.requirementLinkId)) {
      throw new Error("directional link is outside the trusted inventory");
    }
  }
  const findings = structuredClone(requirementFirst.findings);
  const allJudgmentsPass = capabilities.every((capability) => (
    isPassingJudgment(capability.judgment)
      && capability.links.every((link) => isPassingJudgment(link.judgment))
  ));
  const allStatementsPass = proposalStatements.every((statement) => statement.coverage === "sufficient");
  const overall = findings.length === 0
    && allJudgmentsPass
    && allStatementsPass
    && directionalLinks.every((link) => link.status === "confirmed")
    ? "pass"
    : "findings";
  return {
    change: inventory.change,
    review: {
      kind: "semantic-spec-review",
      reviewer: { type: "llm", name: "codex-cli", version: reviewerVersion },
      promptVersion: DIRECTIONAL_PROMPT_VERSION,
      reviewedAt,
      overall,
      passes: [
        { direction: "proposal_to_spec", promptVersion: "openspec-semantic-traceability-proposal-first-v1" },
        { direction: "spec_to_proposal", promptVersion: "openspec-semantic-traceability-requirement-first-v1" },
      ],
    },
    passingJudgment: structuredClone(requirementFirst.passingJudgment),
    proposalStatements,
    capabilities,
    findings,
    directionalLinks,
  };
}

function runProcess(command, args, { cwd, input, forwardOutput = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (forwardOutput) process.stderr.write(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      if (forwardOutput) process.stderr.write(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${path.basename(command)} exited ${code}: ${(stderr || stdout).trim()}`));
    });
    child.stdin.end(input);
  });
}

async function codexVersion(codexCommand) {
  const { stdout } = await runProcess(codexCommand, ["--version"]);
  const version = stdout.trim();
  if (!version) throw new Error("codex --version returned no version");
  return version;
}

async function runCodexJudge({ prompt, model, reasoningEffort, outputFile, workingDirectory, codexCommand, outputSchema = schemaFile }) {
  await runProcess(codexCommand, [
    "exec",
    "--ephemeral",
    "--sandbox", "read-only",
    "--cd", workingDirectory,
    "--skip-git-repo-check",
    "--model", model,
    "--config", `model_reasoning_effort=${JSON.stringify(reasoningEffort)}`,
    "--output-schema", outputSchema,
    "--output-last-message", outputFile,
    "--color", "never",
    "-",
  ], { cwd: workingDirectory, input: prompt });
  return JSON.parse(await readFile(outputFile, "utf8"));
}

function assertSnapshotUnchanged(traceability, inventory) {
  const accepted = new Map(traceability.review.documents.map((document) => [document.file, document.sha256]));
  for (const document of inventory.documents) {
    if (accepted.get(document.file) !== document.sha256) {
      throw new Error(`Source changed during review: ${document.file}`);
    }
  }
}

export async function reviewOpenSpecTraceability({
  changeDirectory: changeDirectoryArgument,
  model,
  reasoningEffort = "high",
  maxRepairs = 2,
  codexCommand = process.env.BETTAVIEW_CODEX_BIN || "codex",
  judge,
  onProgress = () => {},
}) {
  if (typeof model !== "string" || model.trim() === "") throw new Error("A Codex model is required");
  if (typeof reasoningEffort !== "string" || reasoningEffort.trim() === "") throw new Error("A Codex reasoning effort is required");
  if (!Number.isInteger(maxRepairs) || maxRepairs < 0 || maxRepairs > 5) {
    throw new Error("maxRepairs must be an integer from 0 to 5");
  }

  const inventory = await inventoryOpenSpecChange(changeDirectoryArgument);
  const cliVersion = judge ? "injected-judge" : await codexVersion(codexCommand);
  const reviewerVersion = `${model} (${reasoningEffort}) via ${cliVersion}`;
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "bettaview-traceability-review-"));
  try {
    const reviewedAt = new Date().toISOString();
    let attempts = 0;
    const results = {};
    for (const direction of ["proposal_to_spec", "spec_to_proposal"]) {
      const pass = directionalPasses[direction];
      const instructions = await readFile(pass.promptFile, "utf8");
      let repair;
      let accepted = null;
      for (let attempt = 0; attempt <= maxRepairs; attempt += 1) {
        attempts += 1;
        const rawOutputFile = path.join(temporaryDirectory, `${direction}-${attempt}.json`);
        const prompt = buildDirectionalJudgePrompt({ inventory, instructions, direction, repair });
        onProgress({
          direction,
          attempt: attempt + 1,
          maxAttempts: maxRepairs + 1,
          repair: Boolean(repair),
        });
        let rawJudgment;
        try {
          rawJudgment = judge
            ? await judge({ prompt, model, direction, attempt, repair })
            : await runCodexJudge({
              prompt,
              model,
              reasoningEffort,
              outputFile: rawOutputFile,
              outputSchema: pass.schemaFile,
              workingDirectory: inventory.changeDirectory,
              codexCommand,
            });
          accepted = structuredClone(validateDirectionalJudgment(direction, rawJudgment, inventory));
          break;
        } catch (error) {
          if (attempt === maxRepairs) {
            throw new Error(`${direction} review failed after ${attempt + 1} attempt(s): ${error.message}`);
          }
          repair = { error: error.message, judgment: rawJudgment || null };
        }
      }
      results[direction] = accepted;
    }
    const normalized = normalizeDirectionalJudgments({
      proposalFirst: results.proposal_to_spec,
      requirementFirst: results.spec_to_proposal,
    }, { inventory, reviewerVersion, reviewedAt });
    const judgmentFile = path.join(temporaryDirectory, "directional-judgment.json");
    const candidateFile = path.join(temporaryDirectory, "directional-candidate.json");
    await writeFile(judgmentFile, `${JSON.stringify(normalized, null, 2)}\n`);
    await runProcess(process.execPath, [
      materializerFile,
      inventory.changeDirectory,
      judgmentFile,
      candidateFile,
    ]);
    const traceability = await loadTraceability(inventory.changeDirectory, candidateFile);
    assertSnapshotUnchanged(traceability, inventory);
    const destination = path.join(inventory.changeDirectory, "bettaview-traceability.json");
    await copyFile(candidateFile, destination);
    return {
      destination,
      attempts,
      reviewerVersion,
      traceability,
      directionalJudgments: {
        proposalFirst: results.proposal_to_spec,
        requirementFirst: results.spec_to_proposal,
      },
    };
  } catch (error) {
    throw new Error(`Traceability review failed: ${error.message}. Existing sidecar was not changed.`);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}
