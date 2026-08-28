import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalRecheckResolutions,
  codexReviewArgs,
  codexSessionId,
  findingSetFingerprint,
  parseCodexFinalMessage,
  proofRepairPrompt,
  reviewPromptWithSchema,
  reviewResultPayload,
  runBoundedProofReview,
  validateDiscoveryProofShape,
} from "../container/trace-review-proof.mjs";

test("Codex final-message parsing accepts raw and fenced JSON", () => {
  const result = { review: { overall: "pass" } };
  assert.deepEqual(parseCodexFinalMessage(JSON.stringify(result)), result);
  assert.deepEqual(
    parseCodexFinalMessage(`\`\`\`json\n${JSON.stringify(result)}\n\`\`\``),
    result,
  );
  assert.equal(parseCodexFinalMessage("not JSON"), "not JSON");
});

test("OpenRouter review prompts include the exact schema while native Codex prompts do not", () => {
  const prompt = "Review this plan.";
  const schema = '{"type":"object","required":["findings"]}';
  const routed = reviewPromptWithSchema(prompt, schema, "openrouter");
  assert.match(routed, /Required exact JSON schema/);
  assert.match(routed, /Do not nest top-level fields inside review/);
  assert.match(routed, /"required":\["findings"\]/);
  assert.equal(reviewPromptWithSchema(prompt, schema, "codex"), prompt);
});

test("discovery proof shape reports a missing capability links array before materialization", () => {
  assert.throws(
    () => validateDiscoveryProofShape({
      capabilities: [{ path: "retry-agent-stage" }],
      proposalStatements: [],
      findings: [],
    }),
    /capability retry-agent-stage must include links as an array/,
  );
});

test("discovery proof shape reports all repairable structural failures together", () => {
  assert.throws(
    () => validateDiscoveryProofShape({
      capabilities: [{
        path: "retry-agent-stage",
        judgment: { coverage: "sufficient", scope: "in_scope", minimality: "minimal" },
        requirementLinks: [],
      }],
      proposalStatements: [],
      findings: [],
    }),
    (error: Error) => {
      assert.match(error.message, /passingJudgment must be an object/);
      assert.match(error.message, /capability retry-agent-stage\.judgment\.rationale/);
      assert.match(error.message, /capability retry-agent-stage must include links as an array/);
      return true;
    },
  );
});

test("recheck evidence paths are canonical and bounded to reviewed sources", () => {
  const resolutions = canonicalRecheckResolutions([{
    findingId: "finding-1",
    status: "fixed",
    rationale: "The exact requirement is present.",
    currentEvidence: [{ path: "proposal.md", startLine: 1, endLine: 2 }],
    causalSourceDigest: null,
  }], "sac-134", [{ file: "proposal.md", source: "one\ntwo\nthree" }]);
  assert.equal(
    resolutions[0].currentEvidence[0].path,
    "openspec/changes/sac-134/proposal.md",
  );
  assert.throws(
    () => canonicalRecheckResolutions([{
      findingId: "finding-1",
      currentEvidence: [{ path: "tasks.md", startLine: 1, endLine: 1 }],
    }], "sac-134", [{ file: "proposal.md", source: "one" }]),
    /outside the reviewed source set/,
  );
});

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
    modelProvider: "codex" as const,
    capabilityUrl: null,
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

  const routed = codexReviewArgs({
    ...common,
    model: "deepseek/deepseek-v4-pro",
    modelProvider: "openrouter",
    capabilityUrl: "https://worker.example/capabilities",
    sessionId: null,
  });
  assert.ok(routed.includes("--ignore-user-config"));
  assert.ok(routed.includes("--strict-config"));
  assert.ok(routed.includes("--ignore-rules"));
  assert.ok(routed.includes('model_provider="deos_openrouter"'));
  assert.ok(routed.includes('model_providers.deos_openrouter.wire_api="responses"'));
  assert.ok(routed.includes(
    'model_providers.deos_openrouter.base_url="https://worker.example/capabilities/openrouter/v1"',
  ));
});

test("recheck validation receives the provider-neutral review payload", () => {
  const result = { mode: "recheck", resolutions: [{ findingId: "finding-1" }] };
  assert.equal(reviewResultPayload("codex", { result, sessionId: "session-123" }), result);
  assert.equal(reviewResultPayload("openrouter", { result, sessionId: "session-456" }), result);
  assert.throws(() => reviewResultPayload("codex", result), /wrapper is invalid/);
  assert.throws(() => reviewResultPayload("openrouter", result), /wrapper is invalid/);
});
