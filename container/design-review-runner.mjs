#!/usr/bin/env node
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  codexReviewArgs,
  codexSessionId,
  MAXIMUM_PROOF_REPAIRS,
  parseCodexFinalMessage,
  proofRepairPrompt,
  reviewPromptWithSchema,
  runBoundedProofReview,
} from "./trace-review-proof.mjs";
import { designReviewOutputSchema } from "./design-review-schema.mjs";

const OUTPUT_ROOT = "/deos/output";
const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const severities = new Set(["low", "medium", "high"]);
const categories = new Set(["correctness", "completeness", "consistency", "security", "operability"]);

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const asObject = (value, label) => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} is invalid`);
  }
  return value;
};

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
    process.stdout.write(chunk);
  });
  child.stderr.on("data", (chunk) => {
    stderr = `${stderr}${chunk}`.slice(-1_000_000);
    process.stderr.write(chunk);
  });
  child.once("error", reject);
  child.once("exit", (code) => code === 0
    ? resolve({ stdout, stderr })
    : reject(new Error(`${path.basename(command)} exited ${code}: ${(stderr || stdout).trim()}`)));
  child.stdin.end(options.input);
});

const collectOpenRouterReceipts = async (job) => {
  const response = await fetch(`${job.capabilityUrl}/model-review/receipts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${job.capabilityToken}`,
      "Content-Type": "application/json",
      "Deos-Attempt": job.attemptId,
    },
    body: JSON.stringify({ version: 1, action: "list_openrouter_review_receipts" }),
  });
  const body = await response.json();
  if (!response.ok || typeof body !== "object" || body === null || !Array.isArray(body.receipts)) {
    throw new Error("trusted OpenRouter receipt lookup failed");
  }
  const receipts = body.receipts.map((value) => {
    const receipt = asObject(value, "OpenRouter provider receipt");
    if (
      receipt.capability !== "model" || typeof receipt.operationId !== "string" ||
      !["succeeded", "reconciled"].includes(receipt.state)
    ) throw new Error("OpenRouter provider receipt is invalid");
    return receipt;
  });
  await writeFile(
    `${OUTPUT_ROOT}/provider-references.jsonl`,
    `${receipts.map((receipt) => JSON.stringify(receipt)).join("\n")}\n`,
    { mode: 0o600 },
  );
  return receipts.map((receipt) => receipt.operationId);
};

const validate = (raw, review) => {
  const result = asObject(raw, "design review result");
  if (
    result.version !== 1 || result.inputSha256 !== review.inputSha256 ||
    result.phase !== review.phase || !["pass", "concerns"].includes(result.outcome) ||
    typeof result.summary !== "string" || result.summary.trim() !== result.summary ||
    result.summary.length < 1 || !Array.isArray(result.findings)
  ) throw new Error("design review result identity is invalid");
  const sourceLines = new Map(review.sources.map((source) => [source.path, source.content.split("\n").length]));
  const seen = new Set();
  const findings = result.findings.map((rawFinding) => {
    const finding = asObject(rawFinding, "design review finding");
    if (
      typeof finding.id !== "string" || !SAFE_ID.test(finding.id) || seen.has(finding.id) ||
      !severities.has(finding.severity) || !categories.has(finding.category) ||
      typeof finding.message !== "string" || finding.message.trim() !== finding.message ||
      finding.message.length < 1 ||
      !Array.isArray(finding.sourceRanges) || finding.sourceRanges.length < 1
    ) throw new Error("design review finding is invalid");
    seen.add(finding.id);
    for (const rawRange of finding.sourceRanges) {
      const range = asObject(rawRange, "design review source range");
      const lines = sourceLines.get(range.path);
      if (
        lines === undefined || !Number.isSafeInteger(range.startLine) || range.startLine < 1 ||
        !Number.isSafeInteger(range.endLine) || range.endLine < range.startLine || range.endLine > lines
      ) throw new Error(`design review finding ${finding.id} range is invalid`);
    }
    return finding;
  }).sort((left, right) => left.id.localeCompare(right.id));
  if ((result.outcome === "pass") !== (findings.length === 0)) {
    throw new Error("design review outcome does not match findings");
  }
  return { ...result, findings };
};

const main = async () => {
  const job = JSON.parse(await readFile("/deos/run/job.json", "utf8"));
  if (
    job.agentRole !== "reviewer" || job.reviewKind !== "design" || job.reviewMode !== "discovery" ||
    job.permissionProfile !== "review_read_only" || !["codex", "openrouter"].includes(job.modelProvider) ||
    typeof job.model !== "string" || typeof job.reasoning !== "string" ||
    typeof job.materializedContext !== "string"
  ) throw new Error("design review job contract is invalid");
  const materialized = asObject(JSON.parse(job.materializedContext), "materialized context");
  const review = asObject(materialized.designReview, "materialized design review");
  if (
    !SHA256.test(review.inputSha256) || !["self", "independent"].includes(review.phase) ||
    !Array.isArray(review.sources) || review.sources.length < 2 ||
    (review.phase === "self") !== (job.modelProvider === "codex")
  ) throw new Error("materialized design review identity is invalid");
  for (const rawSource of review.sources) {
    const source = asObject(rawSource, "design review source");
    if (
      typeof source.path !== "string" || typeof source.content !== "string" ||
      !SHA256.test(source.sha256) || sha256(source.content) !== source.sha256
    ) throw new Error("materialized design review source changed");
  }
  const schema = designReviewOutputSchema;
  const temporary = await mkdtemp(path.join(os.tmpdir(), "deos-design-review-"));
  try {
    const schemaPath = path.join(temporary, "schema.json");
    const resultPath = path.join(temporary, "result.json");
    await writeFile(schemaPath, JSON.stringify(schema));
    const numbered = review.sources.map((source) => [
      `## ${source.path}`,
      ...source.content.split("\n").map((line, index) => `${index + 1}: ${line}`),
    ].join("\n")).join("\n\n");
    const basePrompt = [
      (await readFile(job.promptPath, "utf8")).trim(), "",
      `Trusted input digest: ${review.inputSha256}`,
      `Phase: ${review.phase}`, "",
      "Exact numbered sources:", numbered,
    ].join("\n");
    const reviewed = await runBoundedProofReview({
      maximumRepairs: MAXIMUM_PROOF_REPAIRS,
      generate: async ({ attempt, prior, failure, sessionId }) => {
        const activePrompt = attempt === 0 ? basePrompt : proofRepairPrompt({
          basePrompt,
          prior,
          failure,
          repair: attempt,
          maximumRepairs: MAXIMUM_PROOF_REPAIRS,
        });
        const args = codexReviewArgs({
          sessionId,
          cwd: job.cwd,
          model: job.model,
          reasoning: job.reasoning,
          schema: schemaPath,
          destination: resultPath,
          modelProvider: job.modelProvider,
          capabilityUrl: job.capabilityUrl,
        });
        const execution = await run("codex", args, {
          cwd: job.cwd,
          input: reviewPromptWithSchema(activePrompt, JSON.stringify(schema), job.modelProvider),
          env: job.modelProvider === "openrouter" ? {
            ...process.env,
            DEOS_MODEL_CAPABILITY_TOKEN: String(job.capabilityToken ?? ""),
            DEOS_ATTEMPT_ID: job.attemptId,
          } : process.env,
        });
        const observedSessionId = codexSessionId(execution.stdout);
        if (sessionId !== null && observedSessionId !== sessionId) {
          throw new Error("design proof repair changed reviewer session");
        }
        return {
          raw: parseCodexFinalMessage(await readFile(resultPath, "utf8")),
          sessionId: observedSessionId,
        };
      },
      validate: (raw) => validate(raw, review),
    });
    await mkdir(OUTPUT_ROOT, { recursive: true });
    await writeFile(`${OUTPUT_ROOT}/raw-review-output.json`, `${JSON.stringify(reviewed.rawJudgments, null, 2)}\n`);
    await writeFile(`${OUTPUT_ROOT}/normalized-review.json`, `${JSON.stringify(reviewed.accepted, null, 2)}\n`);
    await writeFile(`${OUTPUT_ROOT}/design-review-input.json`, `${JSON.stringify(review.input, null, 2)}\n`);
    await writeFile(`${OUTPUT_ROOT}/candidate-inventory.json`, `${JSON.stringify({
      sources: review.sources.map(({ path, sha256 }) => ({ path, sha256 })),
      findings: reviewed.accepted.findings,
    }, null, 2)}\n`);
    await writeFile(`${OUTPUT_ROOT}/review-validation.txt`, [
      `validated input ${review.inputSha256}`,
      `validated ${review.sources.length} exact source digests`,
      `validated ${reviewed.accepted.findings.length} findings`,
      `proof repairs ${reviewed.proofRepairCount}`,
    ].join("\n") + "\n");
    const providerReceipts = job.modelProvider === "openrouter" ? await collectOpenRouterReceipts(job) : [];
    await writeFile(`${OUTPUT_ROOT}/result.json`, `${JSON.stringify({
      outcome: "completed",
      reviewOutcome: reviewed.accepted.outcome,
      summary: reviewed.accepted.summary,
      findingCount: reviewed.accepted.findings.length,
      providerReceipts,
    })}\n`);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
};

main().catch((error) => {
  process.stderr.write(`design review failed: ${error.message}\n`);
  process.exitCode = 1;
});
