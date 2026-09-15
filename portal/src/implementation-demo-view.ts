import type { DemoPlan, DemoResult } from '../../src/implementation-demo-contract.ts';
import { ImplementationStore, type ImplementationRun } from '../../src/implementation-store.ts';

export interface ImplementationDemoView {
  enabled: boolean;
  plan: { value: DemoPlan; current: boolean; createdAt: string } | null;
  gate: { value: DemoResult; current: boolean; createdAt: string } | null;
}

export async function implementationDemoView(db: D1Database, bucket: R2Bucket, work: ImplementationRun): Promise<ImplementationDemoView> {
  const definition = await db.prepare(`SELECT d.canonical_json FROM orchestration_runs r
    JOIN workflow_definitions d ON d.definition_id=r.definition_id AND d.version=r.definition_version
    WHERE r.run_id=?`).bind(work.run_id).first<{ canonical_json: string }>();
  const enabled = Boolean(definition && JSON.parse(definition.canonical_json).jobs?.implementation_demo_plan);
  if (!enabled) return { enabled: false, plan: null, gate: null };
  const store = new ImplementationStore(db, bucket);
  type Row = { payload_key: string; payload_sha: string; created_at: string; tested_base_sha: string;
    candidate_sha: string | null; tree_sha: string; plan_sha: string | null; visit_sequence: number };
  const review = (kind: string) => db.prepare('SELECT * FROM implementation_demo_reviews WHERE run_id=? AND kind=? ORDER BY visit_sequence DESC LIMIT 1')
    .bind(work.run_id, kind).first<Row>();
  const [plan, gate, latest] = await Promise.all([
    review('plan'), review('gate'),
    db.prepare(`SELECT MAX(CASE WHEN node_id='implementation_build' THEN visit_sequence END) AS build,
      MAX(CASE WHEN node_id='implementation_demo_plan' THEN visit_sequence END) AS plan,
      MAX(CASE WHEN node_id='implementation_demo_gate' THEN visit_sequence END) AS gate
      FROM agent_attempts WHERE run_id=?`).bind(work.run_id).first<{build: number | null; plan: number | null; gate: number | null}>(),
  ]);
  return { enabled,
    plan: plan ? { value: await store.read<DemoPlan>(plan.payload_key, plan.payload_sha), createdAt: plan.created_at,
      current: plan.tested_base_sha === work.tested_base_sha && (latest?.plan ?? 0) <= plan.visit_sequence } : null,
    gate: gate ? { value: await store.read<DemoResult>(gate.payload_key, gate.payload_sha), createdAt: gate.created_at,
      current: gate.candidate_sha === work.candidate_sha && gate.tree_sha === work.tree_sha &&
        gate.tested_base_sha === work.tested_base_sha && gate.plan_sha === plan?.payload_sha &&
        Math.max(latest?.build ?? 0, latest?.plan ?? 0, latest?.gate ?? 0) <= gate.visit_sequence } : null,
  };
}
