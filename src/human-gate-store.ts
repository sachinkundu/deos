export type HumanGateKind = "plan" | "design";
export type HumanGateDecision = "revision_requested" | "merge_authorized" | "canceled";

export interface HumanGateVisitRecord {
  run_id: string;
  visit_sequence: number;
  node_id: string;
  gate_kind: HumanGateKind;
  work_type: "proposal_and_specs" | "design";
  work_product_kind: "planning" | "design";
  round: number;
  state: "open" | HumanGateDecision;
  repository: string;
  pull_request_database_id: string;
  pull_request_number: number;
  pull_request_url: string;
  head_branch: string;
  base_branch: "main";
  approved_head_sha: string;
  decision_delivery_id: string | null;
  decision_outcome: HumanGateDecision | null;
  created_at: string;
  decided_at: string | null;
}

export class D1HumanGateStore {
  private readonly database: D1Database;

  constructor(database: D1Database) {
    this.database = database;
  }

  find(runId: string, visitSequence: number): Promise<HumanGateVisitRecord | null> {
    return this.database.prepare(
      "SELECT * FROM human_gate_visits WHERE run_id = ? AND visit_sequence = ?",
    ).bind(runId, visitSequence).first<HumanGateVisitRecord>();
  }

  async bind(input: {
    runId: string;
    visitSequence: number;
    nodeId: string;
    gateKind: HumanGateKind;
    now: string;
  }): Promise<HumanGateVisitRecord> {
    const plan = input.gateKind === "plan";
    const table = plan ? "run_work_products" : "design_work_products";
    const roundExpression = plan
      ? "COALESCE((SELECT MAX(round) FROM trace_review_phases WHERE run_id = ?), 1)"
      : "COALESCE((SELECT MAX(round) FROM design_candidates WHERE run_id = ? AND state = 'validated'), 1)";
    await this.database.prepare(
      `INSERT OR IGNORE INTO human_gate_visits
       (run_id, visit_sequence, node_id, gate_kind, work_type, work_product_kind, round, state,
        repository, pull_request_database_id, pull_request_number, pull_request_url,
        head_branch, base_branch, approved_head_sha, created_at)
       SELECT ?, ?, ?, ?, ?, ?, ${roundExpression}, 'open', repository,
              pull_request_database_id, pull_request_number, pull_request_url,
              remote_branch, base_branch, head_sha, ?
       FROM ${table}
       WHERE run_id = ? AND pull_request_database_id IS NOT NULL AND pull_request_number IS NOT NULL
         AND pull_request_url IS NOT NULL AND head_sha IS NOT NULL AND merge_commit_sha IS NULL`,
    ).bind(
      input.runId, input.visitSequence, input.nodeId, input.gateKind,
      plan ? "proposal_and_specs" : "design", plan ? "planning" : "design",
      input.runId, input.now, input.runId,
    ).run();
    const stored = await this.find(input.runId, input.visitSequence);
    if (stored === null || stored.node_id !== input.nodeId || stored.gate_kind !== input.gateKind ||
      stored.state !== "open") throw new Error("human gate visit binding mismatch");
    return stored;
  }
}
