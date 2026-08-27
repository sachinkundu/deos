import assert from "node:assert/strict";
import test from "node:test";

import {
  codexReviewArgs,
  codexSessionId,
  findingSetFingerprint,
  proofRepairPrompt,
  runBoundedProofReview,
} from "../container/trace-review-proof.mjs";

test("bounded proof repair reuses the exact reviewer session and preserves findings", async () => {
  const raw = { findings: [{ id: "finding-1", message: "Keep this finding." }], links: [] };
  const calls: Array<{ attempt: number; sessionId: string | null }> = [];
  const reviewed = await runBoundedProofReview({
    maximumRepairs: 2,
    generate: async ({ attempt, sessionId }) => {
      calls.push({ attempt, sessionId });
      return { raw: attempt === 0 ? raw : { ...raw, links: ["fixed"] }, sessionId: "session-1" };
    },
    validate: async (candidate, attempt) => {
      if (attempt === 0) throw new Error("link is not bidirectional");
      return candidate;
    },
  });
  assert.equal(reviewed.proofRepairCount, 1);
  assert.equal(reviewed.sessionId, "session-1");
  assert.deepEqual(calls, [
    { attempt: 0, sessionId: null },
    { attempt: 1, sessionId: "session-1" },
  ]);
  assert.equal(
    findingSetFingerprint(reviewed.rawJudgments[0]),
    findingSetFingerprint(reviewed.rawJudgments[1]),
  );
});

test("proof repair rejects a changed base finding set within the fixed bound", async () => {
  await assert.rejects(
    runBoundedProofReview({
      maximumRepairs: 1,
      generate: async ({ attempt }) => ({
        raw: { findings: [{ id: attempt === 0 ? "finding-1" : "finding-2" }] },
        sessionId: "session-1",
      }),
      validate: async (_candidate, attempt) => {
        if (attempt === 0) throw new Error("bad link");
        return "accepted";
      },
    }),
    /changed the base finding set/,
  );
});

test("Codex review session identity is exact and repair prompt is bounded", () => {
  assert.equal(codexSessionId([
    JSON.stringify({ type: "thread.started", thread_id: "session-123" }),
    JSON.stringify({ type: "turn.completed" }),
  ].join("\n")), "session-123");
  const prompt = proofRepairPrompt({
    basePrompt: "Review this exact plan.",
    prior: { findings: [{ id: "finding-1" }] },
    failure: "link is not bidirectional",
    repair: 1,
    maximumRepairs: 2,
  });
  assert.match(prompt, /Keep every prior finding byte-for-byte identical/);
  assert.match(prompt, /link is not bidirectional/);
});

test("Codex reviewer resume uses only options accepted by the resume subcommand", () => {
  const common = {
    cwd: "/deos/review",
    model: "gpt-5.6-sol",
    reasoning: "high",
    schema: "/deos/schema.json",
    destination: "/deos/result.json",
  };
  const initial = codexReviewArgs({ ...common, sessionId: null });
  const resumed = codexReviewArgs({ ...common, sessionId: "session-123" });
  assert.deepEqual(initial.slice(0, 2), ["exec", "-"]);
  assert.ok(initial.includes("--sandbox"));
  assert.ok(initial.includes("--cd"));
  assert.ok(initial.includes("--color"));
  assert.deepEqual(resumed.slice(0, 4), ["exec", "resume", "session-123", "-"]);
  assert.ok(!resumed.includes("--sandbox"));
  assert.ok(!resumed.includes("--cd"));
  assert.ok(!resumed.includes("--color"));
  assert.ok(resumed.includes("--output-schema"));
  assert.ok(resumed.includes("--output-last-message"));
});
