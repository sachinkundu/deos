#!/usr/bin/env node
import { claudeReviewJudgment, finishClaudeReview } from "./claude-review-adapter.mjs";
import { groundedSchema, groundedPrompt, saveGroundedReview, reviewGroundingContext } from "./grounded-review.mjs";
import { recordCaughtError } from "./original-errors.mjs";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { nativeReviewJudgment, saveNativeReviewRequest } from "./native-review-adapter.mjs";

import {
  buildDirectionalJudgePrompt,
  inventoryOpenSpecChange,
  normalizeDirectionalJudgments,
  validateDirectionalJudgment,
} from "/deos/bettaview/src/review-traceability.js";
import { loadTraceability } from "/deos/bettaview/src/traceability.js";
import {
  canonicalRecheckResolutions,
  codexReviewArgs,
  codexSessionId,
  MAXIMUM_PROOF_REPAIRS,
  recoverCodexReview,
  proofRepairPrompt,
  reviewPromptWithSchema,
  reviewResultPayload,
  runBoundedProofReview,
} from "./trace-review-proof.mjs";

const OUTPUT_ROOT = process.env.DEOS_REVIEW_OUTPUT_ROOT ?? "/deos/output";
let groundingOrdinal = 0;
const directionalPasses = {
  proposal_to_spec: {
    promptFile: "/deos/bettaview/prompts/openspec-semantic-traceability-proposal-first-v1.md",
    schemaFile: "/deos/bettaview/prompts/openspec-semantic-traceability-proposal-first-v1.schema.json",
  },
  spec_to_proposal: {
    promptFile: "/deos/bettaview/prompts/openspec-semantic-traceability-requirement-first-v1.md",
    schemaFile: "/deos/bettaview/prompts/openspec-semantic-traceability-requirement-first-v1.schema.json",
  },
};
const materializerFile = "/deos/bettaview/bin/materialize-traceability.js";
const recheckPromptFile = "/deos/config/prompts/openspec-traceability-recheck.md";
const recheckSchemaFile = "/deos/config/schemas/trace-recheck-result-v1.json";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const canonicalize = (value) => Array.isArray(value)
  ? value.map(canonicalize)
  : typeof value === "object" && value !== null
    ? Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)]))
    : value;

const run = (command, args, options = {}) => new Promise((resolve, reject) => {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env,
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
    if (options.forward) process.stdout.write(chunk);
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
    if (options.forward) process.stderr.write(chunk);
  });
  child.once("error", reject);
  child.once("exit", (code) => {
    if (code === 0) resolve({ stdout, stderr });
    else reject(new Error(`${path.basename(command)} exited ${code}: ${(stderr || stdout).trim()}`));
  });
  child.stdin.end(options.input);
});

const codexJudgment = async ({
  prompt,
  model,
  reasoning,
  destination,
  cwd,
  schema,
  sessionId = null,
  modelProvider = "codex",
  capabilityUrl = null,
  capabilityToken = null,
  attemptId = null,
  deadline = null,
  grounding = null,
}) => {
  if (process.env.DEOS_NATIVE_REVIEW_ROOT) {
    return nativeReviewJudgment({ prompt, schema, model, reasoning, sessionId });
  }
  if (modelProvider === "claude") {
    return claudeReviewJudgment({ job: { model, reasoning, capabilityUrl, capabilityToken, attemptId, deadline, grounding },
      prompt, schema: JSON.parse(await readFile(schema, "utf8")), sessionId });
  }
  const originalSchema = JSON.parse(await readFile(schema, "utf8"));
  if (grounding) {
    schema = `${destination}.schema.json`;
    await writeFile(schema, JSON.stringify(groundedSchema(originalSchema)));
    prompt = reviewPromptWithSchema(groundedPrompt(prompt), await readFile(schema, "utf8"), modelProvider);
  }
  const promptPath = `${destination}.prompt.txt`;
  await writeFile(promptPath, prompt, { mode: 0o600 });
  const args = codexReviewArgs({
    sessionId,
    cwd,
    model,
    reasoning,
    schema,
    destination,
    modelProvider,
    capabilityUrl,
  });
  if (grounding) args.push("--config", 'web_search="live"');
  const execution = await run("codex", args, {
    cwd,
    input: await readFile(promptPath, "utf8"),
    forward: true,
    env: modelProvider === "openrouter"
      ? {
          ...process.env,
          DEOS_MODEL_CAPABILITY_TOKEN: String(capabilityToken ?? ""),
          DEOS_ATTEMPT_ID: String(attemptId ?? ""),
        }
      : process.env,
  });
  const observedSessionId = codexSessionId(execution.stdout);
  if (sessionId !== null && observedSessionId !== sessionId) {
    throw new Error("proof repair resumed a different reviewer session");
  }
  const finalMessage = await readFile(destination, "utf8");
  const outputSchema = JSON.parse(await readFile(schema, "utf8"));
  const recovered = recoverCodexReview(execution.stdout, finalMessage, outputSchema.required ?? []);
  process.stderr.write(`review JSON source: offset=${recovered.messageOffset}, recovered=${recovered.recovered}\n`);
  const result = grounding ? await saveGroundedReview(recovered.raw, groundingOrdinal++) : recovered.raw;
  return {
    result,
    sessionId: observedSessionId,
  };
};

const collectOpenRouterReceipts = async () => {
  // Model calls are diagnostics, not write receipts or workflow prerequisites.
  await writeFile(`${OUTPUT_ROOT}/provider-references.jsonl`, "", { mode: 0o600 });
  return [];
};

const asObject = (value, label) => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} is invalid`);
  }
  return value;
};

const recheckJudgment = async ({ job, inventory, temporary }) => {
  const materialized = asObject(JSON.parse(job.materializedContext), "materialized review input");
  const feedback = asObject(materialized.traceabilityFeedback, "traceability feedback");
  const baseline = asObject(feedback.inventory, "baseline inventory");
  if (!Array.isArray(baseline.findings) || typeof baseline.findingSetDigest !== "string") {
    throw new Error("baseline finding inventory is invalid");
  }
  const baselineIds = baseline.findings.map((finding) => asObject(finding, "baseline finding").id);
  if (new Set(baselineIds).size !== baselineIds.length || baselineIds.some((id) => typeof id !== "string")) {
    throw new Error("baseline finding identifiers are invalid");
  }
  const numberedSources = inventory.documents.map((document) => [
    `## ${document.file}`,
    ...document.source.split("\n").map((line, index) => `${index + 1}: ${line}`),
  ].join("\n")).join("\n\n");
  const instructions = await readFile(recheckPromptFile, "utf8");
  const basePrompt = [
    instructions.trim(),
    "",
    `Baseline finding set digest: ${baseline.findingSetDigest}`,
    "Baseline findings:",
    JSON.stringify(baseline.findings),
    "",
    "Current numbered sources:",
    numberedSources,
  ].join("\n");
  const prompt = reviewPromptWithSchema(
    basePrompt,
    await readFile(recheckSchemaFile, "utf8"),
    job.modelProvider,
  );
  const rawFile = path.join(temporary, "raw-recheck.json");
  const generated = await codexJudgment({
    prompt,
    model: job.model,
    reasoning: job.reasoning,
    destination: rawFile,
    cwd: path.join(temporary, job.openspecChange),
    schema: recheckSchemaFile,
    modelProvider: job.modelProvider,
    capabilityUrl: job.capabilityUrl,
    capabilityToken: job.capabilityToken,
    attemptId: job.attemptId,
    deadline: job.deadline,
    grounding: job.grounding,
  });
  const result = reviewResultPayload(job.modelProvider, generated);
  if (
    result.mode !== "recheck" || result.baselineFindingSetDigest !== baseline.findingSetDigest ||
    !Array.isArray(result.resolutions) || result.resolutions.length !== baselineIds.length
  ) throw new Error("recheck changed the fixed finding inventory");
  const resolutions = canonicalRecheckResolutions(
    result.resolutions,
    job.openspecChange,
    inventory.documents,
  ).sort((left, right) =>
    String(left.findingId).localeCompare(String(right.findingId)));
  const expected = [...baselineIds].sort();
  if (resolutions.some((resolution, index) => resolution.findingId !== expected[index])) {
    throw new Error("recheck added, removed, or renamed a finding");
  }
  const allowed = new Set(["fixed", "partially_fixed", "still_present", "cannot_verify"]);
  if (resolutions.some((resolution) => !allowed.has(resolution.status))) {
    throw new Error("recheck returned an invalid resolution");
  }
  const findingCount = resolutions.filter((resolution) => resolution.status !== "fixed").length;
  await mkdir(OUTPUT_ROOT, { recursive: true });
  await writeFile(`${OUTPUT_ROOT}/raw-review-output.json`, `${JSON.stringify([result], null, 2)}\n`);
  await writeFile(`${OUTPUT_ROOT}/normalized-review.json`, `${JSON.stringify(result, null, 2)}\n`);
  await writeFile(`${OUTPUT_ROOT}/bettaview-traceability.json`, `${JSON.stringify(feedback.sidecar, null, 2)}\n`);
  await writeFile(`${OUTPUT_ROOT}/candidate-inventory.json`, `${JSON.stringify({
    change: inventory.change,
    documents: inventory.documents.map(({ file, sha256 }) => ({ file, sha256 })),
    findings: baseline.findings,
    findingSetDigest: baseline.findingSetDigest,
    resolutions,
  }, null, 2)}\n`);
  await writeFile(`${OUTPUT_ROOT}/trace-validation.txt`, "validated closed finding inventory and current exact source hashes\n");
  const providerReceipts = job.modelProvider === "openrouter"
    ? await collectOpenRouterReceipts(job)
    : [];
  await finishClaudeReview(job);
  await writeFile(`${OUTPUT_ROOT}/result.json`, `${JSON.stringify({
    outcome: "completed",
    reviewOutcome: findingCount === 0 ? "pass" : "findings",
    summary: findingCount === 0
      ? "Every baseline finding is fixed."
      : `${findingCount} baseline finding(s) remain open.`,
    findingSetDigest: baseline.findingSetDigest,
    findingCount,
    proofRepairCount: 0,
    providerReceipts,
  })}\n`);
};

const reviewInventory = (traceability, change) => {
  const findings = traceability.findings.map((finding) => ({
    id: finding.id,
    type: finding.type,
    message: finding.message,
    capability: finding.capability,
    allowedRanges: [
      ...finding.proposalEvidence.map((evidence) => ({
        path: `openspec/changes/${change}/${evidence.file}`,
        startLine: evidence.startLine,
        endLine: evidence.endLine,
      })),
      {
        path: `openspec/changes/${change}/${finding.spec.file}`,
        startLine: finding.spec.startLine,
        endLine: finding.spec.endLine,
      },
    ],
  }));
  const linkById = new Map(traceability.links.map((link) => [link.id, link]));
  const statementById = new Map(traceability.proposalStatements.map((statement) => [statement.id, statement]));
  for (const statement of traceability.proposalStatements) {
    if (statement.coverage === "sufficient") continue;
    findings.push({
      id: `proposal-coverage-${statement.proposal.startLine}`,
      type: statement.coverage === "missing" ? "missing_coverage" : "ambiguous",
      message: `The proposal-first pass rated this statement ${statement.coverage}: ${statement.rationale}`,
      capability: "proposal",
      allowedRanges: [{
        path: `openspec/changes/${change}/${statement.proposal.file}`,
        startLine: statement.proposal.startLine,
        endLine: statement.proposal.endLine,
      }, ...statement.requirementLinks.flatMap((linkId) => {
        const link = linkById.get(linkId);
        return link === undefined ? [] : [{
          path: `openspec/changes/${change}/${link.spec.file}`,
          startLine: link.spec.startLine,
          endLine: link.spec.endLine,
        }];
      })],
    });
  }
  const passing = (judgment) => judgment.coverage === "sufficient" &&
    judgment.scope === "in_scope" && judgment.minimality === "minimal";
  for (const capability of traceability.capabilities) {
    if (
      !passing(capability.judgment) &&
      !traceability.findings.some((finding) => finding.capability === capability.path)
    ) {
      const capabilityLinks = traceability.links.filter((link) => link.capability === capability.path);
      findings.push({
        id: `capability-judgment-${capability.path.replaceAll("/", "-")}`,
        type: "ambiguous",
        message: `The requirement-first pass did not give this capability a fully passing judgment: ${capability.judgment.rationale}`,
        capability: capability.path,
        allowedRanges: [{
          path: `openspec/changes/${change}/${capability.proposal.file}`,
          startLine: capability.proposal.startLine,
          endLine: capability.proposal.endLine,
        }, ...capabilityLinks.map((link) => ({
          path: `openspec/changes/${change}/${link.spec.file}`,
          startLine: link.spec.startLine,
          endLine: link.spec.endLine,
        }))],
      });
    }
  }
  for (const link of traceability.links) {
    if (
      passing(link.judgment) ||
      traceability.findings.some((finding) =>
        finding.capability === link.capability && finding.spec.startLine === link.spec.startLine)
    ) continue;
    findings.push({
      id: `requirement-judgment-${link.id}`,
      type: link.judgment.coverage === "missing" ? "unsupported_requirement" :
        link.judgment.minimality === "over_specified" ? "over_specified" : "ambiguous",
      message: `The requirement-first pass did not give this requirement a fully passing judgment: ${link.judgment.rationale}`,
      capability: link.capability,
      allowedRanges: [
        ...link.proposalEvidence.map((evidence) => ({
          path: `openspec/changes/${change}/${evidence.file}`,
          startLine: evidence.startLine,
          endLine: evidence.endLine,
        })),
        {
          path: `openspec/changes/${change}/${link.spec.file}`,
          startLine: link.spec.startLine,
          endLine: link.spec.endLine,
        },
      ],
    });
  }
  const directionalClaims = (traceability.directionalLinks || []).map((claim) => {
    const statement = statementById.get(claim.proposalStatementId);
    const link = linkById.get(claim.requirementLinkId);
    if (!statement || !link) throw new Error("directional claim inventory is invalid");
    const id = `directional-${claim.status.replaceAll("_", "-")}-${statement.proposal.startLine}-${link.id}`;
    const allowedRanges = [{
      path: `openspec/changes/${change}/${statement.proposal.file}`,
      startLine: statement.proposal.startLine,
      endLine: statement.proposal.endLine,
    }, {
      path: `openspec/changes/${change}/${link.spec.file}`,
      startLine: link.spec.startLine,
      endLine: link.spec.endLine,
    }];
    if (claim.status !== "confirmed") findings.push({
      id,
      type: "ambiguous",
      message: `${claim.status === "proposal_only" ? "Only the proposal-first pass" : "Only the requirement-first pass"} claimed this relationship. Proposal-first: ${claim.proposalFirst.rationale} Requirement-first: ${claim.requirementFirst.rationale}`,
      capability: link.capability,
      allowedRanges,
    });
    return { id, ...claim, allowedRanges };
  });
  findings.sort((left, right) => left.id.localeCompare(right.id));
  directionalClaims.sort((left, right) => left.id.localeCompare(right.id));
  return { findings, directionalClaims };
};

const main = async () => {
  const job = JSON.parse(await readFile(process.env.DEOS_JOB_PATH ?? "/deos/run/job.json", "utf8"));
  if (
    job.agentRole !== "reviewer" || job.agentHarness !== "codex" ||
    job.agentHarnessVersion !== "0.147.0" ||
    job.permissionProfile !== "review_read_only" ||
    !["codex", "openrouter", "claude"].includes(job.modelProvider) ||
    typeof job.model !== "string" || typeof job.reasoning !== "string" ||
    !["discovery", "recheck"].includes(job.reviewMode) ||
    typeof job.materializedContext !== "string" ||
    typeof job.openspecChange !== "string" ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(job.openspecChange)
  ) throw new Error("trace review job contract is invalid");
  if (job.modelProvider === "openrouter" && (!job.capabilityUrl || !job.capabilityToken)) {
    throw new Error("trusted OpenRouter adapter is unavailable");
  }

  const source = path.join(job.cwd, "openspec", "changes", job.openspecChange);
  const temporary = await mkdtemp(path.join(os.tmpdir(), "deos-trace-review-"));
  const reviewDirectory = path.join(temporary, job.openspecChange);
  await cp(source, reviewDirectory, { recursive: true, errorOnExist: true });
  await rm(path.join(reviewDirectory, "bettaview-traceability.json"), { force: true });
  const inventory = await inventoryOpenSpecChange(reviewDirectory);
  if (job.reviewMode === "recheck") {
    try {
      await recheckJudgment({ job, inventory, temporary });
      return;
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  }
  const reviewerVersion = `${job.model} (${job.reasoning}) via ${job.modelProvider}`;
  try {
    const reviewedAt = job.nativeReviewedAt ?? new Date().toISOString();
    const directionalResults = {};
    for (const direction of ["proposal_to_spec", "spec_to_proposal"]) {
      const pass = directionalPasses[direction];
      const instructions = await readFile(pass.promptFile, "utf8");
      const schemaSource = await readFile(pass.schemaFile, "utf8");
      directionalResults[direction] = await runBoundedProofReview({
        maximumRepairs: job.grounding ? 0 : MAXIMUM_PROOF_REPAIRS,
        generate: async ({ attempt, prior, failure, sessionId }) => {
          const basePrompt = buildDirectionalJudgePrompt({
            inventory,
            instructions,
            direction,
            repair: null,
          });
          const reviewPrompt = attempt === 0
            ? basePrompt
            : proofRepairPrompt({
                basePrompt,
                prior,
                failure,
                repair: attempt,
                maximumRepairs: MAXIMUM_PROOF_REPAIRS,
              });
          const prompt = job.grounding ? reviewPrompt + reviewGroundingContext(job) : reviewPromptWithSchema(
            reviewPrompt,
            schemaSource,
            job.modelProvider,
          );
          const rawFile = path.join(temporary, `${direction}-${attempt}.json`);
          const generated = await codexJudgment({
            prompt,
            model: job.model,
            reasoning: job.reasoning,
            destination: rawFile,
            cwd: reviewDirectory,
            schema: pass.schemaFile,
            sessionId,
            modelProvider: job.modelProvider,
            capabilityUrl: job.capabilityUrl,
            capabilityToken: job.capabilityToken,
            attemptId: job.attemptId,
            deadline: job.deadline,
            grounding: job.grounding,
          });
          return { raw: generated.result, sessionId: generated.sessionId };
        },
        validate: async (raw) => validateDirectionalJudgment(direction, raw, inventory),
      });
    }
    const normalized = normalizeDirectionalJudgments({
      proposalFirst: directionalResults.proposal_to_spec.accepted,
      requirementFirst: directionalResults.spec_to_proposal.accepted,
    }, { inventory, reviewerVersion, reviewedAt });
    const normalizedFile = path.join(temporary, "directional-review.json");
    const sidecarFile = path.join(temporary, "bettaview-traceability.json");
    await writeFile(normalizedFile, `${JSON.stringify(normalized, null, 2)}\n`);
    const materialized = await run(process.execPath, [
      materializerFile,
      reviewDirectory,
      normalizedFile,
      sidecarFile,
    ]);
    const traceability = await loadTraceability(reviewDirectory, sidecarFile);
    for (const document of inventory.documents) {
      const acceptedDocument = traceability.review.documents.find((entry) => entry.file === document.file);
      if (acceptedDocument?.sha256 !== document.sha256) {
        throw new Error(`source changed during review: ${document.file}`);
      }
    }
    const validatorLog = [
      ...Object.entries(directionalResults).flatMap(([direction, result]) =>
        result.validatorFailures.map((failure, index) => `${direction} attempt ${index + 1}: ${failure}`)),
      materialized.stdout,
      "validated both independent directional passes",
      "accepted one-sided semantic claims as review information",
      "validated exact source hashes",
    ].filter(Boolean).join("\n") + "\n";
    const { findings, directionalClaims } = reviewInventory(traceability, job.openspecChange);
    const findingSetDigest = sha256(JSON.stringify(canonicalize(findings)));
    await mkdir(OUTPUT_ROOT, { recursive: true });
    await writeFile(`${OUTPUT_ROOT}/raw-review-output.json`, `${JSON.stringify({
      proposalFirst: directionalResults.proposal_to_spec.rawJudgments,
      requirementFirst: directionalResults.spec_to_proposal.rawJudgments,
    }, null, 2)}\n`);
    await writeFile(`${OUTPUT_ROOT}/normalized-review.json`, `${JSON.stringify(normalized, null, 2)}\n`);
    await writeFile(`${OUTPUT_ROOT}/bettaview-traceability.json`, await readFile(sidecarFile));
    await writeFile(`${OUTPUT_ROOT}/candidate-inventory.json`, `${JSON.stringify({
      change: inventory.change,
      documents: inventory.documents.map(({ file, sha256 }) => ({ file, sha256 })),
      findings,
      directionalClaims,
      findingSetDigest,
    }, null, 2)}\n`);
    await writeFile(`${OUTPUT_ROOT}/trace-validation.txt`, validatorLog);
    const providerReceipts = job.modelProvider === "openrouter"
      ? await collectOpenRouterReceipts(job)
      : [];
    await finishClaudeReview(job);
    await writeFile(`${OUTPUT_ROOT}/result.json`, `${JSON.stringify({
      outcome: "completed",
      reviewOutcome: traceability.review.overall,
      summary: traceability.review.overall === "pass"
        ? "The semantic review found no traceability findings."
        : `The semantic review recorded ${findings.length} concern(s), including ${directionalClaims.filter((claim) => claim.status !== "confirmed").length} directional disagreement(s).`,
      findingSetDigest,
      findingCount: findings.length,
      confirmedLinkCount: directionalClaims.filter((claim) => claim.status === "confirmed").length,
      disputedLinkCount: directionalClaims.filter((claim) => claim.status !== "confirmed").length,
      proofRepairCount: Object.values(directionalResults)
        .reduce((total, result) => total + result.proofRepairCount, 0),
      providerReceipts,
    })}\n`);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
};

main().catch(async (error) => {
  if (await saveNativeReviewRequest(error)) return;
  recordCaughtError(error, "runner fatal");
  process.stderr.write(`trace review failed: ${error.message}\n`);
  process.exitCode = 1;
});
