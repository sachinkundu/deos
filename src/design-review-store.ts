import {
  designReviewGateEligible,
  type DesignReviewDisposition,
  type DesignReviewFinding,
  type DesignReviewOutcome,
  type DesignReviewPhase,
} from "./design-review.ts";

const changes = (result: D1Result<unknown>): number => result.meta.changes ?? 0;

export interface DesignReviewRoundRecord {
  round_id: string;
  run_id: string;
  round_no: number;
  kind: "initial" | "human_revision";
  self_required: number;
  author_provider: "codex";
  author_model: string;
  author_reasoning: string;
  outside_provider: "openrouter";
  outside_model: string;
  outside_reasoning: string;
  status: "active" | "ready_for_human" | "human_revision" | "merged" | "failed";
  response_turns: number;
  created_at: string;
  updated_at: string;
}

export interface DesignReviewAttemptRecord {
  review_attempt_id: string;
  round_id: string;
  agent_attempt_id: string | null;
  phase: DesignReviewPhase;
  input_sha256: string;
  input_r2_key: string;
  input_object_sha256: string;
  candidate_id: string;
  pr_database_id: string | null;
  head_sha: string | null;
  model_provider: "codex" | "openrouter";
  model: string;
  reasoning: string;
  outcome: DesignReviewOutcome | "invalid" | "failed";
  evidence_manifest_id: string | null;
  evidence_r2_key: string | null;
  evidence_sha256: string | null;
  accepted: number;
  created_at: string;
  completed_at: string | null;
}

export class D1DesignReviewStore {
  private readonly database: D1Database;

  constructor(database: D1Database) {
    this.database = database;
  }

  findRound(runId: string, roundNo: number): Promise<DesignReviewRoundRecord | null> {
    return this.database.prepare(
      "SELECT * FROM design_review_rounds WHERE run_id = ? AND round_no = ?",
    ).bind(runId, roundNo).first<DesignReviewRoundRecord>();
  }

  async ensureRound(input: {
    runId: string;
    roundNo: number;
    authorModel: string;
    authorReasoning: string;
    outsideModel: string;
    outsideReasoning: string;
    now: string;
  }): Promise<DesignReviewRoundRecord> {
    const initial = input.roundNo === 1;
    const roundId = `design-round:${input.runId}:${input.roundNo}`;
    await this.database.prepare(
      `INSERT OR IGNORE INTO design_review_rounds
       (round_id, run_id, round_no, kind, self_required, author_provider, author_model,
        author_reasoning, outside_provider, outside_model, outside_reasoning, status,
        response_turns, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'codex', ?, ?, 'openrouter', ?, ?, ?, 0, ?, ?)`,
    ).bind(
      roundId,
      input.runId,
      input.roundNo,
      initial ? "initial" : "human_revision",
      initial ? 1 : 0,
      input.authorModel,
      input.authorReasoning,
      input.outsideModel,
      input.outsideReasoning,
      initial ? "active" : "human_revision",
      input.now,
      input.now,
    ).run();
    const stored = await this.findRound(input.runId, input.roundNo);
    if (
      stored === null || stored.round_id !== roundId || stored.author_model !== input.authorModel ||
      stored.author_reasoning !== input.authorReasoning || stored.outside_model !== input.outsideModel ||
      stored.outside_reasoning !== input.outsideReasoning || stored.self_required !== Number(initial)
    ) throw new Error("design review round identity mismatch");
    return stored;
  }

  findAcceptedInput(inputSha256: string): Promise<DesignReviewAttemptRecord | null> {
    return this.database.prepare(
      "SELECT * FROM design_review_attempts WHERE input_sha256 = ? AND accepted = 1",
    ).bind(inputSha256).first<DesignReviewAttemptRecord>();
  }

  async recordFailedAttempt(input: {
    reviewAttemptId: string;
    roundId: string;
    agentAttemptId: string;
    phase: DesignReviewPhase;
    inputSha256: string;
    inputR2Key: string;
    candidateId: string;
    prDatabaseId: string | null;
    headSha: string | null;
    modelProvider: "codex" | "openrouter";
    model: string;
    reasoning: string;
    evidenceManifestId: string | null;
    now: string;
  }): Promise<void> {
    await this.database.prepare(
      `INSERT OR IGNORE INTO design_review_attempts
       (review_attempt_id, round_id, agent_attempt_id, phase, input_sha256, input_r2_key,
        input_object_sha256, candidate_id, pr_database_id, head_sha, model_provider,
        model, reasoning, outcome, evidence_manifest_id, accepted, created_at, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'failed', ?, 0, ?, ?)`,
    ).bind(
      input.reviewAttemptId, input.roundId, input.agentAttemptId, input.phase,
      input.inputSha256, input.inputR2Key, input.inputSha256, input.candidateId,
      input.prDatabaseId, input.headSha, input.modelProvider, input.model, input.reasoning,
      input.evidenceManifestId, input.now, input.now,
    ).run();
    const stored = await this.database.prepare(
      "SELECT * FROM design_review_attempts WHERE review_attempt_id = ?",
    ).bind(input.reviewAttemptId).first<DesignReviewAttemptRecord>();
    if (
      stored?.agent_attempt_id !== input.agentAttemptId || stored.outcome !== "failed" ||
      stored.input_sha256 !== input.inputSha256 || stored.candidate_id !== input.candidateId
    ) throw new Error("failed design review identity mismatch");
  }

  async acceptAttempt(input: {
    reviewAttemptId: string;
    roundId: string;
    agentAttemptId: string;
    phase: DesignReviewPhase;
    inputSha256: string;
    inputR2Key: string;
    candidateId: string;
    prDatabaseId: string | null;
    headSha: string | null;
    modelProvider: "codex" | "openrouter";
    model: string;
    reasoning: string;
    outcome: DesignReviewOutcome;
    evidenceManifestId: string;
    evidenceR2Key: string;
    evidenceSha256: string;
    findings: readonly DesignReviewFinding[];
    now: string;
  }): Promise<DesignReviewAttemptRecord> {
    const manifest = await this.database.prepare(
      "SELECT state FROM artifact_manifests WHERE manifest_id = ?",
    ).bind(input.evidenceManifestId).first<{ state: string }>();
    if (manifest?.state !== "complete") throw new Error("design review evidence is not durable");
    const statements = [this.database.prepare(
      `INSERT OR IGNORE INTO design_review_attempts
       (review_attempt_id, round_id, agent_attempt_id, phase, input_sha256, input_r2_key,
        input_object_sha256, candidate_id, pr_database_id, head_sha, model_provider,
        model, reasoning, outcome, evidence_manifest_id, evidence_r2_key,
        evidence_sha256, accepted, created_at, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    ).bind(
      input.reviewAttemptId,
      input.roundId,
      input.agentAttemptId,
      input.phase,
      input.inputSha256,
      input.inputR2Key,
      input.inputSha256,
      input.candidateId,
      input.prDatabaseId,
      input.headSha,
      input.modelProvider,
      input.model,
      input.reasoning,
      input.outcome,
      input.evidenceManifestId,
      input.evidenceR2Key,
      input.evidenceSha256,
      input.now,
      input.now,
    ), ...input.findings.map((finding) => this.database.prepare(
      `INSERT OR IGNORE INTO design_review_findings
       (review_attempt_id, finding_id, severity, category, message, source_ranges_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      input.reviewAttemptId,
      finding.id,
      finding.severity,
      finding.category,
      finding.message,
      JSON.stringify(finding.sourceRanges),
      input.now,
    ))];
    await this.database.batch(statements);
    const stored = await this.findAcceptedInput(input.inputSha256);
    if (
      stored?.review_attempt_id !== input.reviewAttemptId || stored.candidate_id !== input.candidateId ||
      stored.evidence_manifest_id !== input.evidenceManifestId || stored.outcome !== input.outcome
    ) throw new Error("accepted design review identity mismatch");
    const findingCount = await this.database.prepare(
      "SELECT COUNT(*) AS count FROM design_review_findings WHERE review_attempt_id = ?",
    ).bind(input.reviewAttemptId).first<{ count: number }>();
    if (findingCount?.count !== input.findings.length) throw new Error("design review findings read-back mismatch");
    return stored;
  }

  async recordDispositions(input: {
    reviewAttemptId: string;
    authorAttemptId: string;
    resultingCandidateId: string;
    dispositions: readonly DesignReviewDisposition[];
    now: string;
  }): Promise<void> {
    const results = await this.database.batch(input.dispositions.map((disposition) => this.database.prepare(
      `INSERT OR IGNORE INTO design_review_dispositions
       (review_attempt_id, finding_id, author_attempt_id, disposition, reason,
        resulting_candidate_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      input.reviewAttemptId,
      disposition.findingId,
      input.authorAttemptId,
      disposition.status,
      disposition.reason,
      input.resultingCandidateId,
      input.now,
    )));
    if (results.some((result) => changes(result) !== 1)) {
      const count = await this.database.prepare(
        `SELECT COUNT(*) AS count FROM design_review_dispositions
         WHERE review_attempt_id = ? AND author_attempt_id = ? AND resulting_candidate_id = ?`,
      ).bind(input.reviewAttemptId, input.authorAttemptId, input.resultingCandidateId)
        .first<{ count: number }>();
      if (count?.count !== input.dispositions.length) {
        throw new Error("design review dispositions conflict");
      }
    }
  }

  async incrementResponseTurn(roundId: string, now: string): Promise<number> {
    const result = await this.database.prepare(
      `UPDATE design_review_rounds SET response_turns = response_turns + 1, updated_at = ?
       WHERE round_id = ? AND status IN ('active', 'human_revision')`,
    ).bind(now, roundId).run();
    if (changes(result) !== 1) throw new Error("design review round cannot accept a response");
    const row = await this.database.prepare(
      "SELECT response_turns FROM design_review_rounds WHERE round_id = ?",
    ).bind(roundId).first<{ response_turns: number }>();
    if (row === null) throw new Error("design review round is missing");
    return row.response_turns;
  }

  async eligible(runId: string): Promise<boolean> {
    const current = await this.database.prepare(
      `SELECT round.round_id, round.self_required, round.author_model, round.author_reasoning,
              round.outside_model, round.outside_reasoning, candidate.candidate_id,
              work.pull_request_database_id, work.head_sha
       FROM design_review_rounds round
       JOIN design_candidates candidate ON candidate.run_id = round.run_id
        AND candidate.round = round.round_no AND candidate.state = 'validated'
       JOIN design_work_products work ON work.run_id = round.run_id
       WHERE round.run_id = ? AND round.status IN ('active', 'human_revision', 'ready_for_human')
       ORDER BY round.round_no DESC, candidate.created_at DESC, candidate.candidate_id DESC LIMIT 1`,
    ).bind(runId).first<{
      round_id: string;
      self_required: number;
      author_model: string;
      author_reasoning: string;
      outside_model: string;
      outside_reasoning: string;
      candidate_id: string;
      pull_request_database_id: string | null;
      head_sha: string | null;
    }>();
    if (current?.pull_request_database_id === null || current?.head_sha === null || current === null) return false;
    const self = await this.database.prepare(
      `SELECT candidate_id, outcome, model, reasoning FROM design_review_attempts
       WHERE round_id = ? AND phase = 'self' AND accepted = 1
       ORDER BY completed_at DESC LIMIT 1`,
    ).bind(current.round_id).first<{ candidate_id: string; outcome: string; model: string; reasoning: string }>();
    const independent = await this.database.prepare(
      `SELECT attempt.review_attempt_id, attempt.candidate_id, attempt.pr_database_id,
              attempt.head_sha, attempt.outcome, attempt.model, attempt.reasoning,
              (SELECT COUNT(*) FROM design_review_findings finding
               WHERE finding.review_attempt_id = attempt.review_attempt_id) AS finding_count,
              (SELECT COUNT(*) FROM design_review_dispositions disposition
               WHERE disposition.review_attempt_id = attempt.review_attempt_id) AS disposition_count
       FROM design_review_attempts attempt
       WHERE attempt.round_id = ? AND attempt.phase = 'independent' AND attempt.accepted = 1
       ORDER BY attempt.completed_at DESC LIMIT 1`,
    ).bind(current.round_id).first<{
      candidate_id: string;
      pr_database_id: string | null;
      head_sha: string | null;
      outcome: string;
      finding_count: number;
      disposition_count: number;
      model: string;
      reasoning: string;
    }>();
    if (
      (current.self_required === 1 && (
        self?.model !== current.author_model || self.reasoning !== current.author_reasoning
      )) || independent?.model !== current.outside_model ||
      independent.reasoning !== current.outside_reasoning
    ) return false;
    const unresolved = await this.database.prepare(
      `SELECT COUNT(*) AS count FROM agent_attempts
       WHERE run_id = ? AND node_id IN ('design_self_review', 'design_independent_review')
         AND state IN ('pending', 'starting', 'running', 'collecting')`,
    ).bind(runId).first<{ count: number }>();
    return designReviewGateEligible({
      selfRequired: current.self_required === 1,
      selfAccepted: self === null ? null : { candidateId: self.candidate_id, outcome: self.outcome },
      publishedCandidateId: current.candidate_id,
      independentAccepted: independent === null ? null : {
        candidateId: independent.candidate_id,
        prDatabaseId: independent.pr_database_id,
        headSha: independent.head_sha,
        outcome: independent.outcome,
        findingCount: independent.finding_count,
        dispositionCount: independent.disposition_count,
      },
      currentPrDatabaseId: current.pull_request_database_id,
      currentHeadSha: current.head_sha,
      unresolvedAttempts: unresolved?.count ?? 0,
    });
  }

  async bindGate(input: { runId: string; visitSequence: number; now: string }): Promise<void> {
    if (!await this.eligible(input.runId)) throw new Error("design review proof is not current");
    const proof = await this.database.prepare(
      `SELECT round.round_id, round.self_required, work.pull_request_database_id,
              work.head_sha, independent.review_attempt_id AS independent_review_attempt_id,
              independent.input_sha256 AS independent_input_sha256,
              self.review_attempt_id AS self_review_attempt_id, candidate.candidate_id
       FROM design_review_rounds round
       JOIN design_work_products work ON work.run_id = round.run_id
       JOIN design_candidates candidate ON candidate.run_id = round.run_id
        AND candidate.round = round.round_no AND candidate.state = 'validated'
       JOIN design_review_attempts independent ON independent.round_id = round.round_id
        AND independent.phase = 'independent' AND independent.accepted = 1
        AND independent.candidate_id = candidate.candidate_id
        AND independent.pr_database_id = work.pull_request_database_id
        AND independent.head_sha = work.head_sha
       LEFT JOIN design_review_attempts self ON self.round_id = round.round_id
        AND self.phase = 'self' AND self.accepted = 1 AND self.outcome = 'pass'
       WHERE round.run_id = ?
       ORDER BY round.round_no DESC, candidate.created_at DESC,
                independent.completed_at DESC LIMIT 1`,
    ).bind(input.runId).first<{
      round_id: string;
      self_required: number;
      pull_request_database_id: string;
      head_sha: string;
      independent_review_attempt_id: string;
      independent_input_sha256: string;
      self_review_attempt_id: string | null;
      candidate_id: string;
    }>();
    if (proof === null || (proof.self_required === 1 && proof.self_review_attempt_id === null)) {
      throw new Error("design review gate proof disappeared");
    }
    const results = await this.database.batch([
      this.database.prepare(
        `INSERT OR IGNORE INTO design_gate_bindings
         (run_id, visit_sequence, round_id, pr_database_id, head_sha,
          self_review_attempt_id, independent_review_attempt_id,
          independent_input_sha256, created_at)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
         WHERE EXISTS (
           SELECT 1 FROM design_work_products work
           WHERE work.run_id = ? AND work.pull_request_database_id = ? AND work.head_sha = ?
         )
         AND ? = (
           SELECT candidate_id FROM design_candidates
           WHERE run_id = ? AND round = (
             SELECT round_no FROM design_review_rounds WHERE round_id = ?
           ) AND state = 'validated'
           ORDER BY created_at DESC, candidate_id DESC LIMIT 1
         )
         AND NOT EXISTS (
           SELECT 1 FROM agent_attempts
           WHERE run_id = ? AND node_id IN ('design_self_review', 'design_independent_review')
             AND state IN ('pending', 'starting', 'running', 'collecting')
         )`,
      ).bind(
        input.runId,
        input.visitSequence,
        proof.round_id,
        proof.pull_request_database_id,
        proof.head_sha,
        proof.self_review_attempt_id,
        proof.independent_review_attempt_id,
        proof.independent_input_sha256,
        input.now,
        input.runId,
        proof.pull_request_database_id,
        proof.head_sha,
        proof.candidate_id,
        input.runId,
        proof.round_id,
        input.runId,
      ),
      this.database.prepare(
        `UPDATE design_review_rounds SET status = 'ready_for_human', updated_at = ?
         WHERE round_id = ? AND status IN ('active', 'human_revision', 'ready_for_human')`,
      ).bind(input.now, proof.round_id),
    ]);
    const existing = await this.database.prepare(
      `SELECT round_id, pr_database_id, independent_review_attempt_id,
              independent_input_sha256, head_sha FROM design_gate_bindings
       WHERE run_id = ? AND visit_sequence = ?`,
    ).bind(input.runId, input.visitSequence).first<{
      round_id: string;
      pr_database_id: string;
      independent_review_attempt_id: string;
      independent_input_sha256: string;
      head_sha: string;
    }>();
    if (
      existing?.round_id !== proof.round_id ||
      existing.pr_database_id !== proof.pull_request_database_id ||
      existing.independent_review_attempt_id !== proof.independent_review_attempt_id ||
      existing.independent_input_sha256 !== proof.independent_input_sha256 ||
      existing.head_sha !== proof.head_sha
    ) throw new Error("design gate binding conflict");
  }
}
