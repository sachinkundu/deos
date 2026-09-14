import { groundedSchema, groundedPrompt, saveGroundedReview } from "./grounded-review.mjs";
import { readFile, writeFile } from "node:fs/promises";
import { setTimeout as wait } from "node:timers/promises";
import { recordCaughtError } from "./original-errors.mjs";
let ordinal = 0;
const invokeOnce = async (job, action, payload) => {
  const { readResponseText, errorWithContext } = await import("/deos/bin/error-details.ts");
  const endpoint = `${job.capabilityUrl}/claude/${action}`;
  let res;
  try { res = await fetch(endpoint, {
    method: "POST", headers: { Authorization: `Bearer ${job.capabilityToken}`,
      "Deos-Attempt": job.attemptId, "Content-Type": "application/json" },
    body: JSON.stringify(payload), signal: AbortSignal.timeout(60_000),
  }); } catch (cause) { throw Object.assign(errorWithContext(`Claude ${action} transport failed (${endpoint})`, cause), { retryable: true }); }
  let text;
  try { text = await readResponseText(res); }
  catch (cause) { throw Object.assign(errorWithContext(`Claude ${action} response read failed (${endpoint})`, cause), { retryable: true }); }
  let body;
  try { body = JSON.parse(text); }
  catch (cause) { throw Object.assign(errorWithContext(`Claude ${action} returned invalid JSON (HTTP ${res.status})`, cause),
    { endpoint, status: res.status, responseBody: text, retryable: res.status === 429 || res.status >= 500 }); }
  if (!res.ok) throw Object.assign(new Error(`Claude ${action} HTTP ${res.status}: ${body.error ?? text}`), {
    endpoint, status: res.status, responseBody: text, originalErrorId: body.errorId ?? null,
    retryNotBefore: body.retryNotBefore ?? null,
    retryable: res.status === 429 || res.status >= 500,
  });
  return body;
};
export const invokeClaudeReview = async (job, action, payload) => {
  const failures = [];
  for (let attempt = 1; ; attempt++) {
    try { return await invokeOnce(job, action, payload); }
    catch (error) {
      failures.push(error);
      recordCaughtError(error, `Claude ${action} request attempt ${attempt}`);
      // Status only reads the saved invocation. Never replay a provider turn
      // whose execution may already have started.
      const delay = 250 * 2 ** (attempt - 1);
      if (action !== "status" || !error.retryable || attempt >= 3 || Date.now() + delay >= Date.parse(job.deadline)) {
        if (failures.length === 1) throw error;
        throw new AggregateError(failures, `Claude ${action} failed after ${attempt} requests: ${error.message}`, { cause: failures[0] });
      }
      await wait(delay);
    }
  }
};
export const claudeReviewJudgment = async ({ job, prompt, schema, sessionId }) => {
  if (job.model !== "claude-opus-5" || job.reasoning !== "high") throw new Error(`Unsupported Claude review configuration: ${job.model}/${job.reasoning}`);
  const turn = ordinal++;
  const request = { ordinal: turn, prompt: job.grounding ? groundedPrompt(prompt) : prompt,
    schema: job.grounding ? groundedSchema(schema) : schema, sessionId };
  const requestPath = `/deos/output/claude-request-${turn}.json`;
  await writeFile(requestPath, JSON.stringify(request), { mode: 0o600 });
  let response = await invokeClaudeReview(job, "review", JSON.parse(await readFile(requestPath, "utf8")));
  while (!response.receipt) {
    if (!Number.isFinite(Date.parse(job.deadline)) || Date.parse(job.deadline) <= Date.now()) throw new Error(`Claude review exceeded deadline ${job.deadline}, turn ${turn}`);
    await wait(1000);
    response = await invokeClaudeReview(job, "status", { ordinal: turn });
  }
  const receipt = response.receipt;
  if (receipt.attemptId !== job.attemptId || receipt.turn !== turn ||
      (sessionId !== null && sessionId !== receipt.sessionId)) throw Object.assign(new Error("Claude receipt identity mismatch"),
        { expected: { attemptId: job.attemptId, turn, sessionId }, actual: { attemptId: receipt.attemptId, turn: receipt.turn, sessionId: receipt.sessionId } });
  if (job.grounding) {
    if (!receipt.transcript?.text) throw new Error("required independent review transcript missing");
    if (!receipt.grounding?.verification) throw new Error("required independent runtime capability receipt missing");
    const manifestPath = "/deos/output/agent-input-manifest.json";
    const supplied = JSON.parse(await readFile(manifestPath, "utf8"));
    if (supplied.capabilityDigest !== receipt.grounding.capabilityDigest) throw new Error("independent runtime capability digest mismatch");
    await writeFile(manifestPath, JSON.stringify({ ...supplied, ...receipt.grounding }));
    process.stdout.write(receipt.transcript.text);
  }
  return { result: job.grounding ? await saveGroundedReview(receipt.result, turn) : receipt.result, sessionId: receipt.sessionId };
};
export const finishClaudeReview = async job => {
  if (job.modelProvider === "claude") await invokeClaudeReview(job, "finish", {});
};
