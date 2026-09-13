import { groundedSchema, groundedPrompt, saveGroundedReview } from "./grounded-review.mjs";
import { readFile, writeFile } from "node:fs/promises";
import { setTimeout as wait } from "node:timers/promises";
let ordinal = 0;
const invoke = async (job, action, payload) => {
  const res = await fetch(`${job.capabilityUrl}/claude/${action}`, {
    method: "POST", headers: { Authorization: `Bearer ${job.capabilityToken}`,
      "Deos-Attempt": job.attemptId, "Content-Type": "application/json" },
    body: JSON.stringify(payload), signal: AbortSignal.timeout(60_000),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(["auth_failure", "plan_limit"].includes(body.error) ? body.error : "review_failure");
  return body;
};
export const claudeReviewJudgment = async ({ job, prompt, schema, sessionId }) => {
  if (job.model !== "claude-opus-5" || job.reasoning !== "high") throw new Error("review_failure");
  const turn = ordinal++;
  const request = { ordinal: turn, prompt: job.grounding ? groundedPrompt(prompt) : prompt,
    schema: job.grounding ? groundedSchema(schema) : schema, sessionId };
  const requestPath = `/deos/output/claude-request-${turn}.json`;
  await writeFile(requestPath, JSON.stringify(request), { mode: 0o600 });
  let response = await invoke(job, "review", JSON.parse(await readFile(requestPath, "utf8")));
  while (!response.receipt) {
    if (!Number.isFinite(Date.parse(job.deadline)) || Date.parse(job.deadline) <= Date.now()) throw new Error("review_failure");
    await wait(1000);
    response = await invoke(job, "status", { ordinal: turn });
  }
  const receipt = response.receipt;
  if (receipt.attemptId !== job.attemptId || receipt.turn !== turn ||
      (sessionId !== null && sessionId !== receipt.sessionId)) throw new Error("review_failure");
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
  if (job.modelProvider === "claude") await invoke(job, "finish", {});
};
