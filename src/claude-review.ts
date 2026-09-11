/** Shared by the Worker validator and the isolated trusted Claude runner. */
export const CLAUDE_MODEL = "claude-opus-5";
export const CLAUDE_VERSION = "2.1.268";
export const CLAUDE_EFFORT = "high";

export type ClaudeStopCause = "auth_failure" | "plan_limit" | "review_failure";
export class ClaudeReviewError extends Error {
  readonly causeCode: ClaudeStopCause;
  readonly retryNotBefore: string | null;
  constructor(causeCode: ClaudeStopCause, retryNotBefore: string | null = null) {
    super(causeCode);
    this.name = "ClaudeReviewError";
    this.causeCode = causeCode;
    this.retryNotBefore = retryNotBefore;
  }
}

export interface ClaudeEnrollment {
  version: 1;
  secretVersion: string;
  accountBinding: string;
  tokenHmac: string;
  subscription: "pro";
  paidUsageEnabled: false;
}

export const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ClaudeReviewError("review_failure");
  }
  return value as Record<string, unknown>;
};
export const digest = async (text: string): Promise<string> => {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
};
export const tokenHmac = async (token: string, key: string): Promise<string> => {
  if (!token || key.length < 32) throw new ClaudeReviewError("auth_failure");
  const imported = await crypto.subtle.importKey("raw", new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const hash = await crypto.subtle.sign("HMAC", imported, new TextEncoder().encode(`deos:claude-setup-token:v1:${token}`));
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
};

/** Enrollment is an operator assertion, never a provider-returned identity. */
export const verifyClaudeEnrollment = async (input: {
  token: string; key: string; enrollment: ClaudeEnrollment;
  secretVersion: string; expectedAccountBinding: string;
}): Promise<void> => {
  const e = input.enrollment;
  if (e.version !== 1 || !/^[a-f0-9]{64}$/.test(e.accountBinding) ||
      !/^[a-f0-9]{64}$/.test(e.tokenHmac) || !e.secretVersion ||
      e.secretVersion !== input.secretVersion || e.accountBinding !== input.expectedAccountBinding ||
      e.subscription !== "pro" || e.paidUsageEnabled !== false ||
      await tokenHmac(input.token, input.key) !== e.tokenHmac) {
    throw new ClaudeReviewError("auth_failure");
  }
};

export interface ClaudeReceipt {
  version: 1;
  provider: "claude";
  model: typeof CLAUDE_MODEL;
  effort: typeof CLAUDE_EFFORT;
  route: "claude_pro";
  clientVersion: typeof CLAUDE_VERSION;
  attemptId: string;
  turn: number;
  inputSha256: string;
  sessionId: string;
  accountBinding: string;
  secretVersion: string;
  accountEvidence: "trusted_enrollment";
  paidUsage: false;
  observedModels: string[];
  appliedEfforts: unknown[];
  quotaEvidenceScope: "same_client_session";
  quotaObservations: Array<{ status: unknown; resetsAt: unknown; isUsingOverage: false;
    overageStatus: "rejected"; overageDisabledReason: "org_level_disabled" }>;
  result: Record<string, unknown>;
}

/** Normalize only allowlisted facts; never persist the raw provider stream. */
export const validateClaudeTurn = (input: {
  events: unknown[]; appliedEfforts: unknown[]; attemptId: string; turn: number;
  inputSha256: string; sessionId: string; enrollment: ClaudeEnrollment;
}): ClaudeReceipt => {
  const events = input.events.map(record);
  const inits = events.filter(e => e.type === "system" && e.subtype === "init");
  const init = inits[0];
  const finals = events.filter(e => e.type === "result");
  const quotas = events.filter(e => e.type === "rate_limit_event").map(e => record(e.rate_limit_info));
  const rejected = quotas.find(q => q.status === "rejected");
  if (rejected) {
    const reset = rejected.resetsAt;
    const retry = typeof reset === "number" && Number.isSafeInteger(reset) && reset > 0 && reset < 253402300800
      ? new Date(reset * 1000).toISOString() : null;
    throw new ClaudeReviewError("plan_limit", retry);
  }
  if (finals.some(e => e.api_error_status === 401 || e.api_error_status === 403)) {
    throw new ClaudeReviewError("auth_failure");
  }
  if (!init || inits.some(e => e.model !== CLAUDE_MODEL || e.apiKeySource !== "none" ||
      e.claude_code_version !== CLAUDE_VERSION || e.session_id !== input.sessionId) || init.model !== CLAUDE_MODEL || init.apiKeySource !== "none" ||
      init.claude_code_version !== CLAUDE_VERSION || init.session_id !== input.sessionId ||
      finals.length !== 1 || quotas.length === 0 || !input.appliedEfforts.length ||
      input.appliedEfforts.some(e => e !== CLAUDE_EFFORT) ||
      !/^[a-f0-9]{64}$/.test(input.inputSha256) ||
      !input.attemptId || !Number.isSafeInteger(input.turn) || input.turn < 0) {
    throw new ClaudeReviewError("review_failure");
  }
  for (const q of quotas) {
    if (!["allowed", "allowed_warning"].includes(String(q.status)) ||
        q.isUsingOverage !== false || q.overageInUse === true ||
        q.overageStatus !== "rejected" || q.overageDisabledReason !== "org_level_disabled") {
      throw new ClaudeReviewError("review_failure");
    }
  }
  const final = finals[0];
  const usage = record(final.modelUsage);
  if (final.session_id !== input.sessionId || final.is_error !== false || final.subtype !== "success" ||
      final.terminal_reason !== "completed" || Object.keys(usage).length !== 1 ||
      record(usage[CLAUDE_MODEL]).canonicalModel !== CLAUDE_MODEL ||
      record(usage[CLAUDE_MODEL]).provider !== "firstParty") {
    throw new ClaudeReviewError("review_failure");
  }
  const result = final.structured_output ?? (typeof final.result === "string" ? parseResult(final.result) : null);
  return { version: 1, provider: "claude", model: CLAUDE_MODEL, effort: CLAUDE_EFFORT,
    route: "claude_pro", clientVersion: CLAUDE_VERSION, attemptId: input.attemptId,
    turn: input.turn, inputSha256: input.inputSha256, sessionId: input.sessionId,
    accountBinding: input.enrollment.accountBinding, secretVersion: input.enrollment.secretVersion,
    accountEvidence: "trusted_enrollment", paidUsage: false, observedModels: Object.keys(usage),
    appliedEfforts: [...input.appliedEfforts], quotaEvidenceScope: "same_client_session",
    quotaObservations: quotas.map(q => ({ status: q.status, resetsAt: q.resetsAt ?? null,
      isUsingOverage: false, overageStatus: "rejected", overageDisabledReason: "org_level_disabled" })),
    result: record(result) };
};
const parseResult = (text: string): unknown => {
  try { return JSON.parse(text); } catch { throw new ClaudeReviewError("review_failure"); }
};

export const validateClaudeEnvironment = (env: Record<string, string | undefined>): void => {
  for (const [key, value] of Object.entries(env)) {
    if (value && (/^(ANTHROPIC_|OPENROUTER_|AWS_|GOOGLE_|AZURE_)/.test(key) ||
        /^CLAUDE_CODE_(USE_|API_|SUBAGENT_|EFFORT_|SIMPLE|SAFE_MODE)/.test(key))) {
      throw new ClaudeReviewError("review_failure");
    }
  }
};
