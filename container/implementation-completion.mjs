import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** Continue the existing attempt/session; its original wall-clock deadline still applies. */
export async function runImplementationCompletion({ result, outcome, sessionId, check, resume, deadline,
  feedbackRoot, journal, now = Date.now }) {
  let round = 0;
  while (result.code === 0 && outcome !== "failed") {
    if (now() >= deadline) return { result: { code: 124, signal: null }, accepted: false };
    const feedback = await check();
    await appendFile(journal, JSON.stringify({ operation: "verification", round: ++round,
      sessionId, occurredAt: new Date(now()).toISOString(), ...feedback }) + "\n", { mode: 0o600 });
    if (feedback.ready === true) return { result, accepted: true };
    if (feedback.ready !== false || typeof feedback.message !== "string" || !feedback.message)
      throw new Error("Verification returned an invalid feedback response");
    if (now() >= deadline) return { result: { code: 124, signal: null }, accepted: false };
    if (!sessionId) throw new Error("Implementation verification session identity is missing");
    await mkdir(feedbackRoot, { recursive: true, mode: 0o700 });
    const promptPath = join(feedbackRoot, `verification-${round}.md`);
    await writeFile(promptPath, [
      "The trusted completion check needs a repair before this implementation can finish.",
      "Continue in this same session and checkout. Your current files, tools and preview are still available.",
      "", `${feedback.code}: ${feedback.message}`, "",
      'Inspect the recorded results with deos-implementation and a saved request file containing {"action":"status"}. Fix the cause, then rerun all required checks after the last repository edit and refresh the required behavior proof for that tree.',
      "Write scratch requests and evidence outside the repository under /deos/output/requests/. Keep only intended source and documentation changes in the repository.",
      "Use existing safe-test resource state and receipts; do not blindly replay a provider action whose response was lost. Keep the approved scope and evidence requirements.",
      "If a required capability or decision is unavailable, return needs_human with one clear question and reason. Otherwise finish with the corrected result. The trusted gate will check it again.",
      "", `Complete feedback: ${JSON.stringify(feedback)}`, "",
    ].join("\n"), { mode: 0o600, flag: "wx" });
    // Persist the whole prompt before passing its contents to the runner's stdin.
    const next = await resume({ sessionId, promptPath, prompt: await readFile(promptPath, "utf8") });
    result = { code: next.code, signal: next.signal };
    outcome = next.outcome;
  }
  return { result: result.code === 0 ? { ...result, code: 1 } : result, accepted: false };
}
