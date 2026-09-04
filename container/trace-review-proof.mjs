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

export const parseCodexFinalMessage = (message) => {
  if (typeof message !== "string") return message;
  const trimmed = message.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = [...trimmed.matchAll(/```(?:json)?\s*\n([\s\S]*?)\n```/gi)];
    if (fenced.length === 1) {
      try {
        return JSON.parse(fenced[0][1]);
      } catch {
        // Preserve the original value so deterministic validation reports the failure.
      }
    }
    return message;
  }
};

export const reviewPromptWithSchema = (prompt, schema, provider) => provider === "openrouter"
  ? [
      prompt.trim(),
      "",
      "## Required exact JSON schema",
      "",
      "The routed model does not enforce the native output-schema parameter.",
      "Return one JSON object matching this schema exactly. Do not nest top-level fields inside review, rename fields, wrap the object in Markdown, or add prose.",
      schema.trim(),
    ].join("\n")
  : prompt;

export const validateDiscoveryProofShape = (review) => {
  if (typeof review !== "object" || review === null || Array.isArray(review)) {
    throw new Error("review result must be an object");
  }
  const failures = [];
  const isObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
  const validateJudgment = (judgment, label) => {
    if (!isObject(judgment)) {
      failures.push(`${label} must be an object`);
      return;
    }
    for (const field of ["coverage", "scope", "minimality", "rationale"]) {
      if (typeof judgment[field] !== "string" || judgment[field].length === 0) {
        failures.push(`${label}.${field} must be a non-empty string`);
      }
    }
  };

  validateJudgment(review.passingJudgment, "passingJudgment");
  if (!Array.isArray(review.capabilities) || review.capabilities.length === 0) {
    failures.push("review result must include a non-empty capabilities array");
  } else {
    for (const [index, capability] of review.capabilities.entries()) {
      if (!isObject(capability)) {
        failures.push(`capabilities[${index}] must be an object`);
        continue;
      }
      const label = typeof capability.path === "string" && capability.path.length > 0
        ? `capability ${capability.path}`
        : `capabilities[${index}]`;
      validateJudgment(capability.judgment, `${label}.judgment`);
      if (!Array.isArray(capability.links)) {
        failures.push(`${label} must include links as an array`);
      } else {
        for (const [linkIndex, link] of capability.links.entries()) {
          if (!isObject(link)) {
            failures.push(`${label}.links[${linkIndex}] must be an object`);
            continue;
          }
          validateJudgment(link.judgment, `${label}.links[${linkIndex}].judgment`);
        }
      }
    }
  }
  if (!Array.isArray(review.findings)) failures.push("review result must include findings as an array");
  if (!Array.isArray(review.proposalStatements)) {
    failures.push("review result must include proposalStatements as an array");
  }
  if (failures.length > 0) throw new Error(failures.join("; "));
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

export const codexReviewArgs = ({
  sessionId,
  cwd,
  model,
  reasoning,
  schema,
  destination,
  modelProvider = "codex",
  capabilityUrl = null,
}) => {
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
  if (modelProvider === "openrouter") {
    if (typeof capabilityUrl !== "string" || capabilityUrl.length === 0) {
      throw new Error("independent Codex provider URL is missing");
    }
    args.push(
      "--ignore-user-config",
      "--strict-config",
      "--ignore-rules",
      "--config", 'model_provider="deos_openrouter"',
      "--config", 'model_providers.deos_openrouter.name="DEOS OpenRouter"',
      "--config", `model_providers.deos_openrouter.base_url=${JSON.stringify(`${capabilityUrl.replace(/\/$/, "")}/openrouter/v1`)}`,
      "--config", 'model_providers.deos_openrouter.env_key="DEOS_MODEL_CAPABILITY_TOKEN"',
      "--config", 'model_providers.deos_openrouter.wire_api="responses"',
      "--config", 'model_providers.deos_openrouter.env_http_headers={"Deos-Attempt"="DEOS_ATTEMPT_ID"}',
      "--config", 'shell_environment_policy.include_only=["PATH","HOME"]',
      "--config", "model_context_window=1000000",
    );
  }
  if (!resumed) args.push("--color", "never");
  return args;
};

export const reviewResultPayload = (provider, generated) => {
  if (
    ["codex", "openrouter"].includes(provider) &&
    typeof generated === "object" && generated !== null &&
    Object.hasOwn(generated, "result")
  ) return generated.result;
  throw new Error("review provider result wrapper is invalid");
};

export const canonicalRecheckResolutions = (resolutions, change, documents) => {
  const prefix = `openspec/changes/${change}/`;
  const lineCounts = new Map(documents.map((document) => [
    document.file,
    String(document.source).split("\n").length,
  ]));
  return resolutions.map((resolution) => ({
    ...resolution,
    currentEvidence: Array.isArray(resolution.currentEvidence)
      ? resolution.currentEvidence.map((evidence) => {
        if (typeof evidence !== "object" || evidence === null || Array.isArray(evidence)) {
          throw new Error("recheck evidence is outside the reviewed source set");
        }
        const relativePath = typeof evidence.path === "string" && evidence.path.startsWith(prefix)
          ? evidence.path.slice(prefix.length)
          : evidence.path;
        const lineCount = typeof relativePath === "string" ? lineCounts.get(relativePath) : undefined;
        if (
          lineCount === undefined || !Number.isSafeInteger(evidence.startLine) ||
          !Number.isSafeInteger(evidence.endLine) || evidence.startLine < 1 ||
          evidence.endLine < evidence.startLine || evidence.endLine > lineCount
        ) throw new Error("recheck evidence is outside the reviewed source set");
        return { ...evidence, path: `${prefix}${relativePath}` };
      })
      : resolution.currentEvidence,
  }));
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
