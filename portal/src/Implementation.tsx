import { useEffect, useState } from "react";
import type { ImplementationProgress } from "../../src/implementation-progress.ts";
import { ImplementationTasks } from "./ImplementationTasks.tsx";
export interface ImplementationView {
  progress?: ImplementationProgress | null;
  status: string;
  branch: string;
  prUrl: string | null;
  approvedDesignSha: string;
  testedBaseSha: string;
  treeSha: string | null;
  mergeSha: string | null;
  candidateKind: "tasks" | "build" | null;
  tasks: string | null;
  checks: {
    command: string;
    exitCode: number;
    stdout: string;
    stderr: string;
  }[];
  assumptions: string[];
  attempts: {
    attempt_id: string;
    try_sequence: number;
    kind: string;
    status: string;
    tested_base_sha: string;
  }[];
  proof: {
    proof_id: string;
    kind: string;
    caption: string;
    tree_sha: string;
    tested_base_sha: string;
  }[];
  gates: {
    expected_event_kind: string;
    state: string;
    head_sha: string | null;
    base_sha: string | null;
  }[];
  question: { question: string; reason: string; status: string } | null;
  documentation: {
    url: string;
    title: string;
    claim: string;
    artifact_locator: string;
  }[];
  errors: { error_id: string; operation: string; created_at: string }[];
}
export function ImplementationTaskMeter({ progress, active, error, runId, freshness, load }: {
  progress: ImplementationProgress | null | undefined; active: boolean; error: string;
  runId: string; freshness: string; load: <T>(path: string, signal?: AbortSignal) => Promise<T>;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => { setOpen(false); }, [runId]);
  if (!progress || progress.total === 0) return <div className="implementation-task-progress task-progress-empty" role="status">
    {error ? "Task progress unavailable" : "Preparing task checklist…"}
  </div>;
  const remaining = progress.total - progress.completed;
  const stale = active && (Date.now() - Date.parse(progress.observedAt) > 10 * 60_000 || Boolean(error));
  return <div className={`implementation-task-progress${stale ? " is-stale" : ""}`}>
    <div className="task-progress-copy"><button type="button" className="task-progress-link" aria-haspopup="dialog"
      onClick={() => setOpen(true)}>{progress.completed} of {progress.total} tasks done</button><span>{remaining} remaining</span></div>
    <progress max={progress.total} value={progress.completed} aria-label="Author task checklist" />
    <div className="task-progress-meta"><span>{stale ? "Progress update delayed" : progress.source === "saved" ? "Last saved checklist" : "Author checklist"}
      {active && remaining === 0 ? " · Final checks still in progress" : ""}</span>
      <time dateTime={progress.observedAt} title={new Date(progress.observedAt).toLocaleString()}>Updated {new Date(progress.observedAt).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}</time>
    </div>
    {open && <ImplementationTasks key={runId} runId={runId} freshness={freshness} load={load} onClose={() => setOpen(false)} />}
  </div>;
}
export function useImplementation(runId: string, freshness: string, enabled: boolean,
  load: <T>(path: string, signal?: AbortSignal) => Promise<T>) {
  const [data, setData] = useState<ImplementationView | null>(null),
    [error, setError] = useState("");
  useEffect(() => { setData(null); }, [runId]);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setError("");
    void load<ImplementationView | null>(`/api/implementation/${encodeURIComponent(runId)}`, controller.signal)
      .then((value) => { if (!controller.signal.aborted) setData(value); })
      .catch((error) => {
        if (!controller.signal.aborted) setError(String(error));
      });
    return () => controller.abort();
  }, [runId, freshness, enabled, load]);
  return {data: enabled ? data : null, error};
}
