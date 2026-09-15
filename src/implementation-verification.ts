import {
  ImplementationError,
  proofRequirements,
  validateCandidate,
  validateDocumentation,
  type DocumentationAccess,
  type ImplementationCandidate,
  type ProofRequirement,
} from "./implementation-contract.ts";
import type { ImplementationInput, ImplementationRun } from "./implementation-store.ts";
import { sha256Hex } from "./implementation-hash.ts";

// Only actionable author/evidence problems are sent back to the live agent.
// Identity, integrity, storage and authorization faults keep their failure path.
const repairableCodes = new Set([
  "tasks_incomplete", "checks_incomplete", "proof_incomplete",
  "documentation_citation", "documentation_locator", "documentation_missing",
  "invalid_question", "capability_unavailable", "task_scope", "approved_input_changed",
]);
export const isRepairableVerificationError = (error: unknown): error is ImplementationError =>
  error instanceof ImplementationError && repairableCodes.has(error.code);

/** Shared by the live completion check and final collection. No publication or checkpoint writes. */
export async function verifyImplementationCandidate(
  db: D1Database,
  work: ImplementationRun,
  input: ImplementationInput,
  attemptId: string,
  candidate: ImplementationCandidate,
  patch: string,
) {
  if (candidate.attemptId !== attemptId ||
      candidate.testedBaseSha !== work.tested_base_sha ||
      candidate.approvedDesignSha !== work.approved_design_sha)
    throw new ImplementationError("candidate_identity", "Implementation candidate has wrong attempt or approved base");
  if (await sha256Hex(patch) !== candidate.patchSha)
    throw new ImplementationError("patch_integrity", "Implementation patch differs from the captured candidate");
  const requirements = proofRequirements({
    approvedText: input.approvedFiles.map(f => f.content).join("\n"),
    paths: candidate.files.map(f => f.path),
    policy: input.policy,
    prior: JSON.parse(work.requirements_json) as ProofRequirement,
  });
  validateCandidate(candidate, {
    change: work.change_id,
    approvedDesignSha: work.approved_design_sha,
    testedBaseSha: work.tested_base_sha,
    treeSha: candidate.treeSha,
  }, requirements);
  const accesses = await db.prepare("SELECT * FROM implementation_doc_access WHERE attempt_id=?")
    .bind(attemptId).all<DocumentationAccess>();
  validateDocumentation(candidate.sources, accesses.results, input.policy.documentationHosts, candidate.files);
  for (const proof of candidate.proof) {
    const staged = await db.prepare(
      "SELECT sha256,tree_sha FROM implementation_proof WHERE proof_id=? AND run_id=? AND attempt_id=?",
    ).bind(proof.id, work.run_id, attemptId).first<{ sha256: string; tree_sha: string }>();
    if (!staged || staged.sha256 !== proof.sha256 || staged.tree_sha !== candidate.treeSha)
      throw new ImplementationError("untrusted_proof", `Proof was not captured by the trusted broker: ${proof.id}`);
  }
  return { requirements, accesses: accesses.results };
}
