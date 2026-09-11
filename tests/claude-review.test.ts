import { test } from "node:test";
import assert from "node:assert/strict";
import { CLAUDE_MODEL, CLAUDE_VERSION, ClaudeReviewError, tokenHmac,
  validateClaudeTurn, verifyClaudeEnrollment, validateClaudeEnvironment } from "../src/claude-review.ts";

const enrollment = { version: 1 as const, secretVersion: "v1", accountBinding: "a".repeat(64),
  tokenHmac: "b".repeat(64), subscription: "pro" as const, paidUsageEnabled: false as const };
const input = () => ({ attemptId: "attempt-1", turn: 0, inputSha256: "c".repeat(64),
  sessionId: "session-1", enrollment, appliedEfforts: ["high"], events: [
    { type: "system", subtype: "init", model: CLAUDE_MODEL, apiKeySource: "none",
      claude_code_version: CLAUDE_VERSION, session_id: "session-1" },
    { type: "rate_limit_event", rate_limit_info: { status: "allowed", isUsingOverage: false,
      overageStatus: "rejected", overageDisabledReason: "org_level_disabled" } },
    { type: "result", subtype: "success", is_error: false, terminal_reason: "completed",
      session_id: "session-1", result: '{"outcome":"concerns"}',
      modelUsage: { [CLAUDE_MODEL]: { canonicalModel: CLAUDE_MODEL, provider: "firstParty" } } },
  ] as Record<string, any>[] });

test("accepts observed subscription review, retaining concerns without an approval", () => {
  const receipt = validateClaudeTurn(input());
  assert.deepEqual(receipt.result, { outcome: "concerns" });
  assert.equal(receipt.accountEvidence, "trusted_enrollment");
  assert.equal("tokenHmac" in receipt, false);
});
test("rejects missing or contradictory model, effort, quota and completion proof", () => {
  const mutations = [
    (i: ReturnType<typeof input>) => { i.appliedEfforts = []; },
    (i: ReturnType<typeof input>) => { i.appliedEfforts.push("medium"); },
    (i: ReturnType<typeof input>) => { i.events.splice(1, 1); },
    (i: ReturnType<typeof input>) => { i.events[1].rate_limit_info.isUsingOverage = true; },
    (i: ReturnType<typeof input>) => { delete i.events[1].rate_limit_info.isUsingOverage; },
    (i: ReturnType<typeof input>) => { i.events[1].rate_limit_info.overageStatus = "allowed"; },
    (i: ReturnType<typeof input>) => { i.events[2].modelUsage.haiku = {}; },
    (i: ReturnType<typeof input>) => { i.events[0].apiKeySource = "ANTHROPIC_API_KEY"; },
    (i: ReturnType<typeof input>) => { i.events[2].session_id = "another-session"; },
    (i: ReturnType<typeof input>) => { i.events[2].result = "partial output"; },
    (i: ReturnType<typeof input>) => { i.events.push(i.events[2]); },
  ];
  for (const mutate of mutations) {
    const i = input(); mutate(i); assert.throws(() => validateClaudeTurn(i), ClaudeReviewError);
  }
});
test("plan-limit reset uses epoch seconds and never accepts a result", () => {
  const i = input(); i.events[1].rate_limit_info = { status: "rejected", resetsAt: 1789131000 };
  assert.throws(() => validateClaudeTurn(i), (e: unknown) => e instanceof ClaudeReviewError &&
    e.causeCode === "plan_limit" && e.retryNotBefore === "2026-09-11T12:50:00.000Z");
  delete i.events[1].rate_limit_info.resetsAt;
  assert.throws(() => validateClaudeTurn(i), (e: unknown) => e instanceof ClaudeReviewError &&
    e.causeCode === "plan_limit" && e.retryNotBefore === null);
});
test("enrollment rejects replaced secrets and wrong account/version bindings", async () => {
  const token = "test-credential"; const key = "k".repeat(32);
  const e = { ...enrollment, tokenHmac: await tokenHmac(token, key) };
  const valid = { token, key, enrollment: e, secretVersion: "v1", expectedAccountBinding: e.accountBinding };
  await verifyClaudeEnrollment(valid);
  for (const override of [{ token: "other" }, { secretVersion: "v2" }, { expectedAccountBinding: "d".repeat(64) }]) {
    await assert.rejects(verifyClaudeEnrollment({ ...valid, ...override }), ClaudeReviewError);
  }
});
test("ambient paid-provider credentials and overrides fail before contact", () => {
  for (const key of ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL",
    "OPENROUTER_API_KEY", "CLAUDE_CODE_USE_BEDROCK", "CLAUDE_CODE_EFFORT_LEVEL"]) {
    assert.throws(() => validateClaudeEnvironment({ [key]: "present" }), ClaudeReviewError);
  }
  validateClaudeEnvironment({ PATH: "/usr/bin", CLAUDE_CODE_OAUTH_TOKEN: "test" });
});
