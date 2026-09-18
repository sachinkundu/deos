import { ImplementationStore, type ImplementationRun } from './implementation-store.ts';
import type { DemoResult } from './implementation-demo-contract.ts';

export interface DemoHandoff {
  review: DemoResult;
  reviewedCandidateSha: string | null;
  repaired: boolean;
}

export async function demoHandoff(db:D1Database,bucket:R2Bucket,work:ImplementationRun):Promise<DemoHandoff|null> {
  const store = new ImplementationStore(db,bucket);
  type Review = {attempt_id:string;visit_sequence:number;plan_sha:string|null;tested_base_sha:string;tree_sha:string;candidate_sha:string|null;
    outcome:string;payload_key:string;payload_sha:string};
  const latest = (kind:string) => db.prepare('SELECT * FROM implementation_demo_reviews WHERE run_id=? AND kind=? ORDER BY visit_sequence DESC LIMIT 1')
    .bind(work.run_id,kind).first<Review>();
  const [gate, plan, human] = await Promise.all([
    latest('gate'), latest('plan'),
    db.prepare("SELECT MAX(visit_sequence) AS visit FROM implementation_gates WHERE run_id=? AND decision_outcome='revision_requested'")
      .bind(work.run_id).first<{visit:number|null}>(),
  ]);
  if (!gate || !plan) return null;
  // A review of another browser runtime cannot stand in for validation of the
  // replacement. Re-enter the existing independent gate once; after that gate
  // the frozen single-response policy continues unchanged.
  if (work.candidate_key && work.candidate_sha) {
    const candidate = await store.candidate(work);
    if (candidate.browserRuntime) {
      const attempt = await db.prepare('SELECT job_spec_json FROM agent_attempts WHERE attempt_id=? AND run_id=?')
        .bind(gate.attempt_id,work.run_id).first<{job_spec_json:string}>();
      const job = attempt ? JSON.parse(attempt.job_spec_json) : null;
      const context = job?.materializedContext ? JSON.parse(job.materializedContext).demo : null;
      const capabilities = context?.sources?.find((source:{path:string}) => source.path === 'context/runtime-capabilities.json');
      const reviewedRuntime = capabilities ? JSON.parse(capabilities.content).browserRuntime : null;
      if (reviewedRuntime !== candidate.browserRuntime) return null;
    }
  }
  const review = await store.read<DemoResult>(gate.payload_key,gate.payload_sha);
  // Human feedback is a continuation of the already reviewed implementation.
  // After the author responds, hand it back to that human without another
  // automatic Claude review. The original review remains in the transcript.
  if (gate.visit_sequence <= (human?.visit ?? 0)) {
    const response = work.source_attempt_id && await db.prepare(`SELECT visit_sequence FROM agent_attempts
      WHERE attempt_id=? AND run_id=? AND node_id='implementation_build' AND state='completed'`)
      .bind(work.source_attempt_id, work.run_id).first<{visit_sequence:number}>();
    return response && response.visit_sequence > human!.visit!
      ? {review, reviewedCandidateSha:gate.candidate_sha, repaired:true} : null;
  }
  if (gate.outcome === 'pass')
    return {review, reviewedCandidateSha:gate.candidate_sha, repaired:false};
  if (gate.outcome !== 'needs_work' || !work.source_attempt_id) return null;
  const author = await db.prepare("SELECT visit_sequence,job_spec_json FROM agent_attempts WHERE attempt_id=? AND run_id=? AND node_id='implementation_build' AND state='completed'")
    .bind(work.source_attempt_id,work.run_id).first<{visit_sequence:number;job_spec_json:string}>();
  if (!author || author.visit_sequence <= gate.visit_sequence) return null;
  // Route the completed response after the review. Preserve Claude's findings;
  // there is no machine assessment of whether the response resolved them.
  return {review, reviewedCandidateSha:gate.candidate_sha, repaired:true};
}
