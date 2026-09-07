import test from "node:test";
import assert from "node:assert/strict";
import { recoverCodexReview } from "../container/trace-review-proof.mjs";

const review = { outcome: "concerns", findings: [{ id: "one", message: "Keep this finding" }] };
const transcript = (messages: string[], complete = true) => [
  { type: "turn.started" },
  ...messages.map(text => ({ type: "item.completed", item: { type: "agent_message", text } })),
  ...(complete ? [{ type: "turn.completed" }] : []),
].map(e => JSON.stringify(e)).join("\n");

test("recovers fenced JSON before concluding prose without altering findings", () => {
  const result = recoverCodexReview(transcript([`Review:\n\`\`\`json\n${JSON.stringify(review)}\n\`\`\``, "Review complete"]), "Review complete");
  assert.deepEqual(result, { raw: review, messageOffset: 1, recovered: true });
});
test("checks three messages total, skipping malformed newer JSON", () => {
  assert.deepEqual(recoverCodexReview(transcript([JSON.stringify(review), "{bad", "Done"]), "Done").raw, review);
  assert.equal(recoverCodexReview(transcript([JSON.stringify(review), "a", "b", "Done"]), "Done").raw, "Done");
});
test("does not recover from previous turns or tool output", () => {
  const old = transcript([JSON.stringify(review)]);
  const current = transcript(["Done"]);
  assert.equal(recoverCodexReview(`${old}\n${current}`, "Done").raw, "Done");
  const tool = JSON.stringify({ type: "item.completed", item: { type: "command_execution", aggregated_output: JSON.stringify(review) } });
  assert.equal(recoverCodexReview(`${tool}\n${current}`, "Done").raw, "Done");
});
test("does not backtrack through an incomplete turn and prefers newest review", () => {
  assert.equal(recoverCodexReview(transcript([JSON.stringify(review)], false), "Incomplete").raw, "Incomplete");
  const newer = { outcome: "pass", findings: [] };
  assert.deepEqual(recoverCodexReview(transcript([JSON.stringify(review), JSON.stringify(newer)]), JSON.stringify(newer)).raw, newer);
});
