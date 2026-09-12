import assert from "node:assert/strict";
import test from "node:test";
import {
  selectSandboxTier,
  requireAttemptTier,
  TierIntegrityError,
} from "../src/sandbox-tier.ts";

const policy = { sandbox_tier_policy_version: "event-label-v1" };
test("positive event evidence chooses Basic; absence chooses Standard-2", () => {
  assert.deepEqual(
    selectSandboxTier(policy, { ...policy, start_slow_ok: null }),
    {
      tier: "standard-2",
      source: "event_default_standard2",
      policy: "event-label-v1",
    },
  );
  assert.equal(
    selectSandboxTier(
      { ...policy, start_slow_ok: true },
      { ...policy, start_slow_ok: 1 },
    ).tier,
    "basic",
  );
});
test("compatibility policy retains Basic for both fact states", () => {
  for (const fact of [{}, { start_slow_ok: true }]) {
    const row = { ...fact, sandbox_tier_policy_version: "legacy-basic-v1" };
    assert.deepEqual(selectSandboxTier(row, row), {
      tier: "basic",
      source: "legacy_basic",
      policy: "legacy-basic-v1",
    });
  }
});
test("delivery integrity never falls back", () => {
  for (const [queued, stored, cause] of [
    [policy, null, "delivery_missing"],
    [{ ...policy, start_slow_ok: false }, policy, "slow_ok_invalid"],
    [policy, { ...policy, start_slow_ok: 0 }, "slow_ok_invalid"],
    [policy, { ...policy, start_slow_ok: 1 }, "slow_ok_mismatch"],
    [{ ...policy, start_slow_ok: true }, policy, "slow_ok_mismatch"],
    [policy, { sandbox_tier_policy_version: "unknown" }, "tier_policy_unknown"],
    [
      policy,
      { sandbox_tier_policy_version: "legacy-basic-v1" },
      "tier_policy_mismatch",
    ],
  ] as const)
    assert.throws(
      () => selectSandboxTier(queued, stored),
      (error: unknown) =>
        error instanceof TierIntegrityError && error.causeCode === cause,
    );
});
test("unknown and mismatched attempt tiers fail before provider mapping", () => {
  assert.equal(requireAttemptTier("standard-2", "standard-2"), "standard-2");
  for (const [run, attempt] of [
    [null, null],
    ["basic", "standard-2"],
    ["standard-2", "fast"],
  ]) {
    assert.throws(() => requireAttemptTier(run, attempt));
  }
});
