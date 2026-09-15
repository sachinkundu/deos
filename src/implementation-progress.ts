export interface TaskCounts { completed: number; total: number }
export interface ImplementationProgress extends TaskCounts {
  observedAt: string;
  source: "author" | "saved";
  tasksSha?: string;
}

export interface ImplementationTask { text: string; completed: boolean; line: number }
export interface ImplementationTaskSection { title: string; tasks: ImplementationTask[] }
export interface ImplementationChecklist {
  progress: ImplementationProgress | null;
  sections: ImplementationTaskSection[];
}

export function parseImplementationTasks(markdown: string): ImplementationTaskSection[] {
  const sections: ImplementationTaskSection[] = [];
  let section: ImplementationTaskSection = { title: "Tasks", tasks: [] };
  let fence: { character: string; length: number } | null = null;
  for (const [index, line] of markdown.split(/\r?\n/).entries()) {
    const marker = line.match(/^\s*(`{3,}|~{3,})(.*)$/);
    if (marker) {
      if (!fence) fence = { character: marker[1][0], length: marker[1].length };
      else if (marker[1][0] === fence.character && marker[1].length >= fence.length && !marker[2].trim()) fence = null;
      continue;
    }
    if (fence) continue;
    const heading = line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*$/);
    if (heading) {
      section = { title: heading[1], tasks: [] };
      continue;
    }
    const task = line.match(/^\s*- \[([ xX])\]\s+(\S.*)$/);
    if (task) {
      if (!section.tasks.length) sections.push(section);
      section.tasks.push({ text: task[2], completed: task[1].toLowerCase() === "x", line: index + 1 });
    } else if (/^\s+\S/.test(line) && section.tasks.length) {
      section.tasks.at(-1)!.text += ` ${line.trim()}`;
    }
  }
  return sections;
}

export function countImplementationTasks(markdown: string): TaskCounts {
  const tasks = parseImplementationTasks(markdown).flatMap(section => section.tasks);
  return { completed: tasks.filter(task => task.completed).length, total: tasks.length };
}

export async function saveImplementationProgress(db: D1Database, input: {
  runId: string; attemptId: string; testedBaseSha: string; tasksSha: string;
  completed: number; total: number; observedAt: string;
}) {
  // A delayed read must not replace a new try's observation or survive a base change.
  const result = await db.prepare(`INSERT INTO implementation_progress
    (attempt_id,run_id,tested_base_sha,completed,total,tasks_sha,observed_at)
    SELECT ?,?,?,?,?,?,? WHERE EXISTS (
      SELECT 1 FROM implementation_tries t JOIN agent_attempts a ON a.attempt_id=t.attempt_id AND a.run_id=t.run_id
      JOIN implementation_runs r ON r.run_id=t.run_id
      WHERE t.attempt_id=? AND t.run_id=? AND t.tested_base_sha=? AND r.tested_base_sha=t.tested_base_sha
        AND a.state IN ('running','collecting') AND t.try_sequence=(SELECT MAX(try_sequence) FROM implementation_tries WHERE run_id=t.run_id))
    ON CONFLICT(attempt_id) DO UPDATE SET completed=excluded.completed,total=excluded.total,tasks_sha=excluded.tasks_sha,observed_at=excluded.observed_at
      WHERE excluded.observed_at>implementation_progress.observed_at`)
    .bind(input.attemptId,input.runId,input.testedBaseSha,input.completed,input.total,input.tasksSha,input.observedAt,
      input.attemptId,input.runId,input.testedBaseSha).run();
  if (result.meta.changes) await db.prepare(`UPDATE orchestration_runs SET updated_at=MAX(updated_at,?)
    WHERE run_id=? AND status='active'`).bind(input.observedAt,input.runId).run();
}

export async function latestImplementationProgress(db: D1Database, runId: string): Promise<ImplementationProgress | null> {
  const row = await db.prepare(`SELECT p.completed,p.total,p.observed_at,p.tasks_sha FROM implementation_progress p
    JOIN implementation_tries t ON t.attempt_id=p.attempt_id AND t.run_id=p.run_id
    JOIN implementation_runs r ON r.run_id=p.run_id AND r.tested_base_sha=p.tested_base_sha
    WHERE p.run_id=? AND t.try_sequence=(SELECT MAX(try_sequence) FROM implementation_tries WHERE run_id=p.run_id)`)
    .bind(runId).first<{completed:number;total:number;observed_at:string;tasks_sha:string}>();
  return row ? {completed:row.completed,total:row.total,observedAt:row.observed_at,source:"author",tasksSha:row.tasks_sha} : null;
}
