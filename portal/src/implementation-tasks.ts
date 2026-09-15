import { countImplementationTasks, latestImplementationProgress, parseImplementationTasks,
  type ImplementationChecklist } from "../../src/implementation-progress.ts";
import { sha256Hex } from "../../src/implementation-hash.ts";
import type { ImplementationRun, ImplementationStore } from "../../src/implementation-store.ts";

export class ChecklistPendingError extends Error {}

export async function implementationTaskSnapshot(store: ImplementationStore, work: ImplementationRun, latestAttemptId?: string) {
  const candidate = work.candidate_key ? await store.candidate(work) : null;
  const saved = candidate?.tasks ? {
    ...countImplementationTasks(candidate.tasks), observedAt: work.updated_at, source: "saved" as const,
    tasksSha: await sha256Hex(candidate.tasks),
  } : null;
  const progress = candidate?.kind === "build" && work.source_attempt_id === latestAttemptId
    ? saved : await latestImplementationProgress(store.db, work.run_id) ?? saved;
  return { candidate, progress };
}

export async function loadImplementationChecklist(store: ImplementationStore, work: ImplementationRun): Promise<ImplementationChecklist> {
  const latest = await store.db.prepare("SELECT attempt_id FROM implementation_tries WHERE run_id=? ORDER BY try_sequence DESC LIMIT 1")
    .bind(work.run_id).first<{ attempt_id: string }>();
  const { candidate, progress } = await implementationTaskSnapshot(store, work, latest?.attempt_id);
  if (!progress) return { progress: null, sections: [] };
  let markdown = candidate?.tasks ?? "";
  if (progress.source === "author") {
    const key = `implementation/${work.run_id}/${progress.tasksSha}/task-progress.md`;
    if (await store.bucket.head(key)) {
      markdown = new TextDecoder().decode(await store.readBytes(key, progress.tasksSha!));
    } else if (!markdown || await sha256Hex(markdown) !== progress.tasksSha) {
      // Older deployments stored counts only. Never substitute an older
      // checklist whose checkboxes disagree with the current observation.
      throw new ChecklistPendingError("The checklist is waiting for its next progress update. Please try again shortly.");
    }
  }
  const counts = countImplementationTasks(markdown);
  if (counts.completed !== progress.completed || counts.total !== progress.total) {
    throw new Error("Implementation checklist counts do not match the saved observation");
  }
  return { progress, sections: parseImplementationTasks(markdown) };
}
