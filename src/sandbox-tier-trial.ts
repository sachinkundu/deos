import { requireSandboxTier, type SandboxTier } from "./sandbox-tier.ts";

interface Member {
  comparison_id: string;
  pair_id: string;
  issue_id: string;
  workload_digest: string;
  controls_digest: string;
  planned_tier: SandboxTier;
  launch_order: number;
  run_id: string | null;
}
interface Run {
  run_id: string;
  status: string;
  sandbox_tier: string;
  definition_digest: string;
  route_repository: string;
  author_model_provider: string;
  author_model: string;
  author_reasoning: string;
  independent_review_provider: string;
  independent_review_model: string;
  independent_review_reasoning: string;
}
interface Attempt {
  attempt_id: string;
  run_id: string;
  node_id: string;
  visit_sequence: number;
  sandbox_tier: string;
  started_at: string | null;
  ended_at: string | null;
  state: string;
  created_at: string;
  job_spec_json: string;
}
const digest = async (value: unknown): Promise<string> =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(JSON.stringify(value)),
      ),
    ),
  )
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
const median = (values: number[]): number | null => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b),
    index = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[index]
    : (sorted[index - 1] + sorted[index]) / 2;
};

export async function saveTierTrial(
  db: D1Database,
  input: unknown,
): Promise<void> {
  if (!input || typeof input !== "object")
    throw new Error("Invalid trial manifest");
  const manifest = input as { comparisonId: unknown; members: unknown };
  if (
    typeof manifest.comparisonId !== "string" ||
    !/^[a-z0-9-]{1,80}$/.test(manifest.comparisonId) ||
    !Array.isArray(manifest.members) ||
    manifest.members.length < 2 ||
    manifest.members.length > 100
  )
    throw new Error("Invalid trial manifest");
  const members = manifest.members as Member[];
  const issues = new Set<string>(),
    pairs = new Map<string, Set<string>>(),
    orders = new Set<number>();
  for (const member of members) {
    requireSandboxTier(member.planned_tier);
    if (
      !/^[a-zA-Z0-9-]{1,80}$/.test(member.pair_id) ||
      !/^[a-f0-9-]{36}$/.test(member.issue_id) ||
      !/^[a-f0-9]{64}$/.test(member.workload_digest) ||
      !/^[a-f0-9]{64}$/.test(member.controls_digest) ||
      !Number.isSafeInteger(member.launch_order) ||
      member.launch_order < 1 ||
      issues.has(member.issue_id) ||
      orders.has(member.launch_order)
    )
      throw new Error("Invalid trial member");
    issues.add(member.issue_id);
    orders.add(member.launch_order);
    const tiers = pairs.get(member.pair_id) ?? new Set<string>();
    if (tiers.has(member.planned_tier))
      throw new Error("Duplicate planned tier in pair");
    tiers.add(member.planned_tier);
    pairs.set(member.pair_id, tiers);
  }
  if ([...pairs.values()].some((tiers) => tiers.size !== 2))
    throw new Error("Each pair needs both planned tiers");
  const now = new Date().toISOString();
  // D1 batches are transactions. A member already launched fails the entire manifest.
  await db.batch([
    db
      .prepare(
        "INSERT INTO sandbox_tier_trials(comparison_id,created_at) VALUES (?,?)",
      )
      .bind(manifest.comparisonId, now),
    ...members.map((member) =>
      db
        .prepare(
          `INSERT INTO sandbox_tier_trial_members
    (comparison_id,pair_id,issue_id,workload_digest,controls_digest,planned_tier,launch_order,created_at)
    VALUES (?,?,CASE WHEN EXISTS(SELECT 1 FROM orchestration_runs WHERE issue_id=?) THEN NULL ELSE ? END,?,?,?,?,?)`,
        )
        .bind(
          manifest.comparisonId,
          member.pair_id,
          member.issue_id,
          member.issue_id,
          member.workload_digest,
          member.controls_digest,
          member.planned_tier,
          member.launch_order,
          now,
        ),
    ),
  ]);
}

export async function tierTrialReport(db: D1Database, comparisonId: string) {
  const members = (
    await db
      .prepare(
        "SELECT * FROM sandbox_tier_trial_members WHERE comparison_id=? ORDER BY launch_order",
      )
      .bind(comparisonId)
      .all<Member>()
  ).results;
  const runs = (
    await db
      .prepare(
        `SELECT r.* FROM orchestration_runs r JOIN sandbox_tier_trial_members m ON m.run_id=r.run_id WHERE m.comparison_id=?`,
      )
      .bind(comparisonId)
      .all<Run>()
  ).results;
  const attempts = (
    await db
      .prepare(
        `SELECT a.* FROM agent_attempts a JOIN sandbox_tier_trial_members m ON m.run_id=a.run_id
    WHERE m.comparison_id=? ORDER BY a.created_at,a.attempt_id`,
      )
      .bind(comparisonId)
      .all<Attempt>()
  ).results;
  return buildTierTrialReport(comparisonId, members, runs, attempts);
}

export async function buildTierTrialReport(
  comparisonId: string,
  members: Member[],
  runs: Run[],
  attempts: Attempt[],
) {
  const exclusions: Array<{
      pairId: string;
      reason: string;
      members: unknown;
    }> = [],
    included: Member[] = [],
    differences: unknown[] = [];
  for (const pairId of new Set(members.map((member) => member.pair_id))) {
    const pair = members.filter((member) => member.pair_id === pairId);
    const facts = pair.map((member) => ({
      ...member,
      actual_tier:
        runs.find((run) => run.run_id === member.run_id)?.sandbox_tier ?? null,
    }));
    let reason: string | null = null;
    if (pair.length !== 2 || pair.some((member) => !member.run_id))
      reason = "incomplete_pair";
    else if (facts.some((member) => member.actual_tier !== member.planned_tier))
      reason = "planned_tier_mismatch";
    else if (
      pair[0].workload_digest !== pair[1].workload_digest ||
      pair[0].controls_digest !== pair[1].controls_digest
    )
      reason = "manifest_controls_mismatch";
    const actualDigests: string[] = [];
    for (const member of pair) {
      const run = runs.find((run) => run.run_id === member.run_id),
        sample = attempts.filter((attempt) => attempt.run_id === member.run_id);
      if (
        !run ||
        !["succeeded", "failed", "blocked", "canceled", "denied"].includes(
          run.status,
        ) ||
        !sample.length ||
        sample.some((attempt) => !attempt.started_at || !attempt.ended_at)
      ) {
        reason ??= "incomplete_attempts";
        continue;
      }
      if (
        sample.some(
          (attempt) =>
            !Number.isFinite(Date.parse(attempt.started_at!)) ||
            !Number.isFinite(Date.parse(attempt.ended_at!)) ||
            Date.parse(attempt.ended_at!) < Date.parse(attempt.started_at!),
        )
      )
        reason ??= "invalid_attempt_time";
      if (sample.some((attempt) => attempt.sandbox_tier !== run.sandbox_tier))
        reason ??= "attempt_tier_mismatch";
      const commits = sample.map(
        (attempt) => JSON.parse(attempt.job_spec_json).checkoutCommit,
      );
      if (
        commits.some(
          (commit) =>
            typeof commit !== "string" || !/^[a-f0-9]{40}$/.test(commit),
        ) ||
        new Set(commits).size !== 1
      )
        reason ??= "repository_base_unverified";
      actualDigests.push(
        await digest({
          repository: run.route_repository,
          base: commits[0],
          workflow: run.definition_digest,
          author: [
            run.author_model_provider,
            run.author_model,
            run.author_reasoning,
          ],
          reviewer: [
            run.independent_review_provider,
            run.independent_review_model,
            run.independent_review_reasoning,
          ],
        }),
      );
    }
    if (
      actualDigests.length === 2 &&
      (actualDigests[0] !== actualDigests[1] ||
        actualDigests.some(
          (value, index) => value !== pair[index].controls_digest,
        ))
    )
      reason ??= "frozen_controls_mismatch";
    if (reason) {
      exclusions.push({ pairId, reason, members: facts });
      continue;
    }
    included.push(...pair);
    const total = (tier: string) =>
      attempts
        .filter(
          (attempt) =>
            attempt.run_id ===
            pair.find((member) => member.planned_tier === tier)!.run_id,
        )
        .reduce(
          (sum, attempt) =>
            sum +
            Date.parse(attempt.ended_at!) -
            Date.parse(attempt.started_at!),
          0,
        );
    differences.push({
      pairId,
      standard2MinusBasicMs: total("standard-2") - total("basic"),
    });
  }
  const stages = [...new Set(attempts.map((attempt) => attempt.node_id))];
  const groups = [];
  for (const tier of ["basic", "standard-2"])
    for (const stage of stages) {
      const ids = new Set(
        included
          .filter((member) => member.planned_tier === tier)
          .map((member) => member.run_id),
      );
      const sample = attempts.filter(
        (attempt) => ids.has(attempt.run_id) && attempt.node_id === stage,
      );
      const first = new Set<string>();
      let retries = 0,
        firstPassSuccess = 0;
      for (const attempt of sample) {
        const key = attempt.run_id + ":" + attempt.node_id;
        if (first.has(key)) retries++;
        else if (attempt.state === "completed") firstPassSuccess++;
        first.add(key);
      }
      groups.push({
        tier,
        stage,
        completedAttemptCount: sample.length,
        medianElapsedMs: median(
          sample.map(
            (attempt) =>
              Date.parse(attempt.ended_at!) - Date.parse(attempt.started_at!),
          ),
        ),
        firstPassSuccessCount: firstPassSuccess,
        failedAttemptCount: sample.filter(
          (attempt) => attempt.state !== "completed",
        ).length,
        retryCount: retries,
      });
    }
  return {
    comparisonId,
    members,
    groups,
    pairedElapsedDifferences: differences,
    exclusions,
  };
}
