#!/usr/bin/env node
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

import {
  buildJudgePrompt,
  inventoryOpenSpecChange,
  normalizeJudgment,
} from "/deos/bettaview/src/review-traceability.js";
import { loadTraceability } from "/deos/bettaview/src/traceability.js";

const OUTPUT_ROOT = "/deos/output";
const PROMPT_VERSION = "openspec-semantic-traceability-bidirectional-v2";
const promptFile = `/deos/bettaview/prompts/${PROMPT_VERSION}.md`;
const schemaFile = `/deos/bettaview/prompts/${PROMPT_VERSION}.schema.json`;
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
    stdout = `${stdout}${chunk}`.slice(-1_000_000);
    if (options.forward) process.stdout.write(chunk);
  });
  child.stderr.on("data", (chunk) => {
    stderr = `${stderr}${chunk}`.slice(-1_000_000);
    if (options.forward) process.stderr.write(chunk);
  });
  child.once("error", reject);
  child.once("exit", (code) => {
    if (code === 0) resolve({ stdout, stderr });
    else reject(new Error(`${path.basename(command)} exited ${code}: ${(stderr || stdout).trim()}`));
  });
  child.stdin.end(options.input);
});

const codexJudgment = async ({ prompt, model, reasoning, destination, cwd, schema = schemaFile }) => {
  await run("codex", [
    "exec",
    "--ephemeral",
    "--sandbox", "read-only",
    "--cd", cwd,
    "--skip-git-repo-check",
    "--model", model,
    "--config", `model_reasoning_effort=${JSON.stringify(reasoning)}`,
    "--output-schema", schema,
    "--output-last-message", destination,
    "--json",
    "--color", "never",
    "-",
  ], { cwd, input: prompt, forward: true, env: process.env });
  return JSON.parse(await readFile(destination, "utf8"));
};

const openRouterJudgment = async ({ prompt, job, repairAttempt, mode = "discovery" }) => {
  const response = await fetch(`${job.capabilityUrl}/model-review`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${job.capabilityToken}`,
      "Content-Type": "application/json",
      "Deos-Attempt": job.attemptId,
    },
    body: JSON.stringify({
      version: 1,
      action: "openrouter_trace_review",
      model: job.model,
      reasoning: job.reasoning,
      mode,
      repairAttempt,
      prompt,
    }),
  });
  const body = await response.json();
  if (!response.ok || typeof body !== "object" || body === null || typeof body.operationId !== "string") {
    throw new Error("trusted OpenRouter review adapter rejected the request");
  }
  await writeFile(
    `${OUTPUT_ROOT}/provider-references.jsonl`,
    `${JSON.stringify({
      capability: "model",
      operationId: body.operationId,
      state: body.state,
      providerResourceId: body.providerResourceId ?? null,
    })}\n`,
    { flag: "a", mode: 0o600 },
  );
  return body.result;
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
  const prompt = [
    instructions.trim(),
    "",
    `Baseline finding set digest: ${baseline.findingSetDigest}`,
    "Baseline findings:",
    JSON.stringify(baseline.findings),
    "",
    "Current numbered sources:",
    numberedSources,
  ].join("\n");
  const rawFile = path.join(temporary, "raw-recheck.json");
  const result = job.modelProvider === "codex"
    ? await codexJudgment({
        prompt,
        model: job.model,
        reasoning: job.reasoning,
        destination: rawFile,
        cwd: path.join(temporary, job.openspecChange),
        schema: recheckSchemaFile,
      })
    : await openRouterJudgment({ prompt, job, repairAttempt: 0, mode: "recheck" });
  if (
    result.mode !== "recheck" || result.baselineFindingSetDigest !== baseline.findingSetDigest ||
    !Array.isArray(result.resolutions) || result.resolutions.length !== baselineIds.length
  ) throw new Error("recheck changed the fixed finding inventory");
  const resolutions = [...result.resolutions].sort((left, right) =>
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
    ? (await readFile(`${OUTPUT_ROOT}/provider-references.jsonl`, "utf8"))
        .trim().split("\n").filter(Boolean).map((line) => JSON.parse(line).operationId)
    : [];
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

const findingInventory = (traceability, change) => traceability.findings
  .map((finding) => ({
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
  }))
  .sort((left, right) => left.id.localeCompare(right.id));

const main = async () => {
  const job = JSON.parse(await readFile("/deos/run/job.json", "utf8"));
  if (
    job.agentRole !== "reviewer" || job.permissionProfile !== "review_read_only" ||
    !["codex", "openrouter"].includes(job.modelProvider) ||
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
  const instructions = await readFile(promptFile, "utf8");
  const reviewerVersion = `${job.model} (${job.reasoning}) via ${job.modelProvider}`;
  const rawJudgments = [];
  let accepted;
  let validatorLog = "";
  try {
    for (let attempt = 0; attempt < 1; attempt += 1) {
      const reviewedAt = new Date().toISOString();
      const prompt = buildJudgePrompt({ inventory, instructions, reviewerVersion, reviewedAt });
      const rawFile = path.join(temporary, `raw-${attempt}.json`);
      try {
        const raw = job.modelProvider === "codex"
          ? await codexJudgment({
              prompt,
              model: job.model,
              reasoning: job.reasoning,
              destination: rawFile,
              cwd: reviewDirectory,
            })
          : await openRouterJudgment({ prompt, job, repairAttempt: attempt });
        rawJudgments.push(raw);
        const normalized = normalizeJudgment(raw, {
          change: inventory.change,
          reviewerVersion,
          reviewedAt,
        });
        const normalizedFile = path.join(temporary, `normalized-${attempt}.json`);
        const sidecarFile = path.join(temporary, `sidecar-${attempt}.json`);
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
        accepted = { normalized, traceability, sidecarFile };
        validatorLog = `${materialized.stdout}validated exact source hashes\n`;
        break;
      } catch (error) {
        validatorLog += `attempt ${attempt + 1}: ${error.message}\n`;
        throw error;
      }
    }
    if (!accepted) throw new Error("trace review ended without accepted proof");
    const findings = findingInventory(accepted.traceability, job.openspecChange);
    const findingSetDigest = sha256(JSON.stringify(canonicalize(findings)));
    await mkdir(OUTPUT_ROOT, { recursive: true });
    await writeFile(`${OUTPUT_ROOT}/raw-review-output.json`, `${JSON.stringify(rawJudgments, null, 2)}\n`);
    await writeFile(`${OUTPUT_ROOT}/normalized-review.json`, `${JSON.stringify(accepted.normalized, null, 2)}\n`);
    await writeFile(`${OUTPUT_ROOT}/bettaview-traceability.json`, await readFile(accepted.sidecarFile));
    await writeFile(`${OUTPUT_ROOT}/candidate-inventory.json`, `${JSON.stringify({
      change: inventory.change,
      documents: inventory.documents.map(({ file, sha256 }) => ({ file, sha256 })),
      findings,
      findingSetDigest,
    }, null, 2)}\n`);
    await writeFile(`${OUTPUT_ROOT}/trace-validation.txt`, validatorLog);
    const providerReceipts = job.modelProvider === "openrouter"
      ? (await readFile(`${OUTPUT_ROOT}/provider-references.jsonl`, "utf8"))
          .trim().split("\n").filter(Boolean).map((line) => JSON.parse(line).operationId)
      : [];
    await writeFile(`${OUTPUT_ROOT}/result.json`, `${JSON.stringify({
      outcome: "completed",
      reviewOutcome: accepted.traceability.review.overall,
      summary: accepted.traceability.review.overall === "pass"
        ? "The semantic review found no traceability findings."
        : `The semantic review recorded ${findings.length} finding(s).`,
      findingSetDigest,
      findingCount: findings.length,
      proofRepairCount: Math.max(0, rawJudgments.length - 1),
      providerReceipts,
    })}\n`);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
};

main().catch((error) => {
  process.stderr.write(`trace review failed: ${error.message}\n`);
  process.exitCode = 1;
});
