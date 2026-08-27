import { lstat, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";

import {
  MAXIMUM_FLESCH_KINCAID_GRADE,
  MINIMUM_FLESCH_READING_EASE,
  proseForReadability,
  readabilityPassed,
  readabilityWords,
  scoreReadability,
} from "../shared/planning-language.mjs";

const MAXIMUM_COMMAND_BYTES = 64 * 1024;
const MAXIMUM_FILES = 64;

const safeChange = (value) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);

export const safePlanningPath = (change, path) => {
  const root = `openspec/changes/${change}/`;
  if (!path.startsWith(root) || path.includes("..") || path.includes("//")) return false;
  const relative = path.slice(root.length);
  return relative === ".openspec.yaml" || relative === "proposal.md" ||
    /^specs\/[a-z0-9]+(?:-[a-z0-9]+)*\/spec\.md$/.test(relative);
};

const command = (args, cwd, timeout = 120_000) => new Promise((resolve, reject) => {
  const child = spawn(args[0], args.slice(1), {
    cwd,
    env: { PATH: process.env.PATH, HOME: "/root" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const stdout = [];
  const stderr = [];
  let bytes = 0;
  let truncated = false;
  const collect = (target) => (chunk) => {
    bytes += chunk.length;
    if (bytes <= MAXIMUM_COMMAND_BYTES) target.push(chunk);
    else if (!truncated) {
      truncated = true;
      child.kill("SIGKILL");
    }
  };
  child.stdout.on("data", collect(stdout));
  child.stderr.on("data", collect(stderr));
  child.once("error", reject);
  const timer = setTimeout(() => child.kill("SIGKILL"), timeout);
  child.once("exit", (code, signal) => {
    clearTimeout(timer);
    resolve({
      code,
      signal,
      truncated,
      stdout: Buffer.concat(stdout).toString("utf8"),
      stderr: Buffer.concat(stderr).toString("utf8"),
    });
  });
});

export const changedPathsFromPorcelain = (value) => {
  const fields = value.split("\0");
  if (fields.at(-1) === "") fields.pop();
  const paths = [];
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    if (field.length < 4 || field[2] !== " ") throw new Error("git status output is invalid");
    const status = field.slice(0, 2);
    paths.push(field.slice(3));
    if (/[RC]/.test(status)) {
      index += 1;
      if (index >= fields.length || fields[index].length === 0) {
        throw new Error("git rename status is incomplete");
      }
      paths.push(fields[index]);
    }
  }
  return [...new Set(paths)].sort();
};

const concise = (value) => value
  .replace(/[\u0000-\u001f\u007f]+/g, " ")
  .replace(/\s+/g, " ")
  .trim()
  .slice(0, 1_000);

export const runAuthorCompletionCheck = async ({ cwd, change, execute = command }) => {
  if (!safeChange(change)) throw new Error("author completion change identity is invalid");
  const root = `openspec/changes/${change}`;
  const failures = [];

  const status = await execute(
    ["git", "status", "--porcelain=v1", "-z", "--untracked-files=all"],
    cwd,
    60_000,
  );
  if (status.code !== 0 || status.truncated) {
    throw new Error("author completion could not inspect changed paths");
  }
  const changedPaths = changedPathsFromPorcelain(status.stdout);
  const forbiddenPaths = changedPaths.filter((path) => !safePlanningPath(change, path));
  if (forbiddenPaths.length > 0) {
    failures.push(`Revert changes outside this plan: ${forbiddenPaths.join(", ")}.`);
  }

  const inventory = await execute(
    ["git", "ls-files", "--cached", "--others", "--exclude-standard", "--", root],
    cwd,
    60_000,
  );
  if (inventory.code !== 0 || inventory.truncated) {
    throw new Error("author completion could not inspect the planning files");
  }
  const paths = inventory.stdout.split("\n").filter(Boolean).sort();
  if (paths.length > MAXIMUM_FILES || new Set(paths).size !== paths.length) {
    failures.push(`Keep at most ${MAXIMUM_FILES} unique files in ${root}.`);
  }
  const invalidPaths = paths.filter((path) => !safePlanningPath(change, path));
  if (invalidPaths.length > 0) {
    failures.push(`Remove unsupported plan files: ${invalidPaths.join(", ")}.`);
  }
  for (const required of [`${root}/.openspec.yaml`, `${root}/proposal.md`]) {
    if (!paths.includes(required)) failures.push(`Create ${required}.`);
  }
  if (!paths.some((path) => path.startsWith(`${root}/specs/`))) {
    failures.push(`Create at least one delta spec under ${root}/specs/.`);
  }

  const readablePaths = paths.filter((path) => safePlanningPath(change, path));
  const files = [];
  for (const path of readablePaths) {
    const absolutePath = `${cwd}/${path}`;
    let metadata;
    try {
      metadata = await lstat(absolutePath);
    } catch (error) {
      if (error?.code === "ENOENT") {
        failures.push(`Restore ${path}.`);
        continue;
      }
      throw error;
    }
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      failures.push(`Replace ${path} with a regular file.`);
      continue;
    }
    const content = await readFile(absolutePath, "utf8");
    files.push({ path, content });
    const badLine = content.split("\n").findIndex((line) => /[ \t]+$/.test(line));
    if (badLine >= 0) failures.push(`Remove trailing whitespace from ${path}:${badLine + 1}.`);
    if (content.length > 0 && !content.endsWith("\n")) failures.push(`Add a final newline to ${path}.`);
  }

  const strict = await execute(["openspec", "validate", change, "--strict"], cwd, 120_000);
  if (strict.code !== 0 || strict.truncated) {
    const detail = concise(`${strict.stdout}\n${strict.stderr}`) || "the command returned no details";
    failures.push(`Fix strict OpenSpec validation: ${detail}.`);
  }

  const readabilityByFile = {};
  for (const file of files.filter(({ path }) => path.endsWith(".md"))) {
    const prose = proseForReadability(file.content);
    const score = scoreReadability(prose);
    readabilityByFile[file.path] = score;
    if (readabilityWords(prose).length === 0 || !readabilityPassed(score)) {
      failures.push(
        `Rewrite ${file.path}: reading ease ${score.fleschReadingEase} ` +
        `(minimum ${MINIMUM_FLESCH_READING_EASE}); Flesch-Kincaid grade ` +
        `${score.fleschKincaidGrade} (maximum ${MAXIMUM_FLESCH_KINCAID_GRADE}).`,
      );
    }
  }

  return Object.freeze({
    ok: failures.length === 0,
    allowedPaths: forbiddenPaths.length === 0 && invalidPaths.length === 0 ? "passed" : "failed",
    strictOpenSpec: strict.code === 0 && !strict.truncated ? "passed" : "failed",
    whitespace: failures.some((failure) => /whitespace|final newline/.test(failure)) ? "failed" : "passed",
    readability: failures.some((failure) => failure.startsWith("Rewrite ")) ? "failed" : "passed",
    changedPaths: Object.freeze(changedPaths),
    filePaths: Object.freeze(readablePaths),
    readabilityByFile: Object.freeze(readabilityByFile),
    failures: Object.freeze(failures),
  });
};

export const authorCorrectionPrompt = (check, round, maximumRepairs) => [
  "The trusted completion hook rejected this completion.",
  `This is in-place correction ${round} of ${maximumRepairs}. Stay in this same session and checkout.`,
  "Fix only the exact deterministic failures below. Preserve all unrelated plan text and prior semantic repairs.",
  ...check.failures.map((failure) => `- ${failure}`),
  "Do not start a semantic review. Return completed only when the named plan is valid.",
].join("\n");

export const runBoundedAuthorCompletion = async ({
  initialCheck,
  initialResult,
  sessionId,
  maximumRepairs,
  resume,
  check,
  now = () => new Date().toISOString(),
}) => {
  let currentCheck = initialCheck;
  let result = initialResult;
  const rounds = [{ round: 0, kind: "initial", checkedAt: now(), ...currentCheck }];
  for (let repair = 1; !currentCheck.ok && repair <= maximumRepairs; repair += 1) {
    result = await resume({
      sessionId,
      prompt: authorCorrectionPrompt(currentCheck, repair, maximumRepairs),
    });
    if (result.code !== 0 || result.outcome !== "completed") break;
    currentCheck = await check();
    rounds.push({
      round: repair,
      kind: "same_session_resume",
      checkedAt: now(),
      ...currentCheck,
    });
  }
  return Object.freeze({ check: currentCheck, result, rounds: Object.freeze(rounds) });
};
