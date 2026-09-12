export type SandboxTier = "basic" | "standard-2";
export type SandboxTierPolicy = "event-label-v1" | "legacy-basic-v1";
export interface SandboxTierSelection {
  tier: SandboxTier;
  source: "event_slow_ok" | "event_default_standard2" | "legacy_basic";
  policy: SandboxTierPolicy;
}
export type TierIntegrityCause =
  | "delivery_missing"
  | "slow_ok_invalid"
  | "slow_ok_mismatch"
  | "tier_policy_unknown"
  | "tier_policy_mismatch";
export class TierIntegrityError extends Error {
  readonly causeCode: TierIntegrityCause;
  constructor(causeCode: TierIntegrityCause) {
    super(`Sandbox tier delivery integrity: ${causeCode}`);
    this.causeCode = causeCode;
  }
}
export function requireSandboxTier(value: unknown): SandboxTier {
  if (value !== "basic" && value !== "standard-2")
    throw new Error(`Invalid saved sandbox tier: ${String(value)}`);
  return value;
}
export function requireAttemptTier(
  run: unknown,
  attempt: unknown,
): SandboxTier {
  const tier = requireSandboxTier(run);
  if (requireSandboxTier(attempt) !== tier)
    throw new Error("Sandbox attempt tier differs from its run");
  return tier;
}
export function sandboxCreationCause(
  error: unknown,
): "capacity" | "quota" | "concurrency" | "creation_failed" {
  const seen = new Set<unknown>();
  while (error instanceof Error && !seen.has(error)) {
    seen.add(error);
    const text = `${error.name} ${error.message}`;
    if (/quota/i.test(text)) return "quota";
    if (/concurrency|max[_ -]?instances|instance limit/i.test(text))
      return "concurrency";
    if (/capacity|resource limit/i.test(text)) return "capacity";
    error = error.cause;
  }
  return "creation_failed";
}
export function selectSandboxTier(
  queued: { start_slow_ok?: unknown; sandbox_tier_policy_version?: unknown },
  delivery: {
    start_slow_ok?: unknown;
    sandbox_tier_policy_version?: unknown;
  } | null,
): SandboxTierSelection {
  if (!delivery) throw new TierIntegrityError("delivery_missing");
  // SQL NULL represents absence on a stored row. Queue facts must be absent or true.
  const saved =
    delivery.start_slow_ok == null ? undefined : delivery.start_slow_ok;
  const queuedFact = queued.start_slow_ok;
  if (
    (saved !== undefined && saved !== 1 && saved !== true) ||
    (queuedFact !== undefined && queuedFact !== true)
  )
    throw new TierIntegrityError("slow_ok_invalid");
  if ((saved !== undefined) !== (queuedFact !== undefined))
    throw new TierIntegrityError("slow_ok_mismatch");
  const policy = delivery.sandbox_tier_policy_version;
  if (
    (policy !== "event-label-v1" && policy !== "legacy-basic-v1") ||
    (queued.sandbox_tier_policy_version !== "event-label-v1" &&
      queued.sandbox_tier_policy_version !== "legacy-basic-v1")
  ) {
    throw new TierIntegrityError("tier_policy_unknown");
  }
  if (policy !== queued.sandbox_tier_policy_version)
    throw new TierIntegrityError("tier_policy_mismatch");
  if (policy === "legacy-basic-v1")
    return { tier: "basic", source: "legacy_basic", policy };
  return saved === undefined
    ? { tier: "standard-2", source: "event_default_standard2", policy }
    : { tier: "basic", source: "event_slow_ok", policy };
}
