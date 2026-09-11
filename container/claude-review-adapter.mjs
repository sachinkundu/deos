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
  let response = await invoke(job, "review", { ordinal: turn, prompt, schema, sessionId });
  while (!response.receipt) {
    if (!Number.isFinite(Date.parse(job.deadline)) || Date.parse(job.deadline) <= Date.now()) throw new Error("review_failure");
    await wait(1000);
    response = await invoke(job, "status", { ordinal: turn });
  }
  const receipt = response.receipt;
  if (receipt.attemptId !== job.attemptId || receipt.turn !== turn ||
      (sessionId !== null && sessionId !== receipt.sessionId)) throw new Error("review_failure");
  return { result: receipt.result, sessionId: receipt.sessionId };
};
export const finishClaudeReview = async job => {
  if (job.modelProvider === "claude") await invoke(job, "finish", {});
};
