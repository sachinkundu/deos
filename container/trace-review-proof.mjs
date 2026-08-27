export const MAXIMUM_PROOF_REPAIRS = 2;

const canonicalize = (value) => Array.isArray(value)
  ? value.map(canonicalize)
  : typeof value === "object" && value !== null
    ? Object.fromEntries(Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)]))
    : value;

export const findingSetFingerprint = (review) => {
  const findings = Array.isArray(review?.findings) ? [...review.findings] : [];
  findings.sort((left, right) => String(left?.id ?? "").localeCompare(String(right?.id ?? "")));
  return JSON.stringify(canonicalize(findings));
};

export const codexSessionId = (stdout) => {
  const ids = stdout.split("\n").filter(Boolean).flatMap((line) => {
    try {
      const event = JSON.parse(line);
      return event.type === "thread.started" && typeof event.thread_id === "string"
        ? [event.thread_id]
        : [];
    } catch {
      return [];
    }
  });
  const unique = [...new Set(ids)];
  if (unique.length !== 1) throw new Error("review session identity is missing or ambiguous");
  return unique[0];
};

export const codexReviewArgs = ({ sessionId, cwd, model, reasoning, schema, destination }) => {
  const resumed = sessionId !== null;
  const args = resumed
    ? ["exec", "resume", sessionId, "-"]
    : ["exec", "-"];
  if (!resumed) args.push("--sandbox", "read-only", "--cd", cwd);
  args.push(
    "--skip-git-repo-check",
    "--model", model,
    "--config", `model_reasoning_effort=${JSON.stringify(reasoning)}`,
    "--output-schema", schema,
    "--output-last-message", destination,
    "--json",
  );
  if (!resumed) args.push("--color", "never");
  return args;
};

export const reviewResultPayload = (provider, generated) => {
  if (provider === "openrouter") return generated;
  if (
    provider === "codex" &&
    typeof generated === "object" && generated !== null &&
    Object.hasOwn(generated, "result")
  ) return generated.result;
  throw new Error("review provider result wrapper is invalid");
};

export const proofRepairPrompt = ({ basePrompt, prior, failure, repair, maximumRepairs }) => [
  basePrompt,
  "",
  `Trusted proof repair ${repair} of ${maximumRepairs}.`,
  "The prior semantic review is complete, but its trace proof failed deterministic validation.",
  "Return a complete replacement JSON result for the same exact plan.",
  "Keep every prior finding byte-for-byte identical. Do not add, remove, rename, or rewrite a finding.",
  "Correct only links, ranges, hashes, quotes, or other proof form named by the validator.",
  `Validator failure: ${failure}`,
  "Prior JSON result:",
  JSON.stringify(prior),
].join("\n");

export const runBoundedProofReview = async ({ maximumRepairs, generate, validate }) => {
  let sessionId = null;
  let prior = null;
  let failure = null;
  let firstFindingSet = null;
  const rawJudgments = [];
  const validatorFailures = [];
  for (let attempt = 0; attempt <= maximumRepairs; attempt += 1) {
    const generated = await generate({
      attempt,
      repair: attempt,
      maximumRepairs,
      prior,
      failure,
      sessionId,
    });
    if (attempt === 0) sessionId = generated.sessionId ?? null;
    else if (sessionId !== null && generated.sessionId !== sessionId) {
      throw new Error("proof repair resumed a different reviewer session");
    }
    const raw = generated.raw;
    rawJudgments.push(raw);
    const fingerprint = findingSetFingerprint(raw);
    firstFindingSet ??= fingerprint;
    try {
      if (attempt > 0 && fingerprint !== firstFindingSet) {
        throw new Error("proof repair changed the base finding set");
      }
      const accepted = await validate(raw, attempt);
      return {
        accepted,
        rawJudgments,
        proofRepairCount: attempt,
        sessionId,
        validatorFailures,
      };
    } catch (error) {
      failure = error instanceof Error ? error.message : "proof validation failed";
      validatorFailures.push(failure);
      prior = raw;
      if (attempt === maximumRepairs) throw error;
    }
  }
  throw new Error("proof review ended without accepted output");
};
