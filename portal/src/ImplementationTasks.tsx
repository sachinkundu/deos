import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ListChecks, SpinnerGap, X } from "@phosphor-icons/react";
import { errorText } from "../../src/error-details.ts";
import type { ImplementationChecklist } from "../../src/implementation-progress.ts";

export function ImplementationTasks({ runId, freshness, load, onClose }: {
  runId: string; freshness: string;
  load: <T>(path: string, signal?: AbortSignal) => Promise<T>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [data, setData] = useState<ImplementationChecklist | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [filter, setFilter] = useState<"all" | "remaining" | "done">("all");

  useEffect(() => {
    const opener = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.showModal();
    return () => {
      document.body.style.overflow = overflow;
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setError("");
    void load<ImplementationChecklist | null>(`/api/implementation/${encodeURIComponent(runId)}/tasks`, controller.signal)
      .then(value => { if (!controller.signal.aborted) setData(value ?? {progress:null,sections:[]}); })
      .catch(reason => {
        if (!controller.signal.aborted) {
          console.error("Implementation checklist read failed", errorText(reason));
          setError("Tasks could not be loaded. Please try again shortly.");
        }
      });
    return () => controller.abort();
  }, [runId, freshness, load, retry]);

  const progress = data?.progress;
  const sections = data?.sections.map(section => ({ ...section,
    tasks: section.tasks.filter(task => filter === "all" || task.completed === (filter === "done")),
  })).filter(section => section.tasks.length) ?? [];

  return createPortal(<dialog ref={dialog} className="task-checklist-dialog" aria-labelledby="task-checklist-title"
    onKeyDown={event => {
      if (event.key !== "Tab") return;
      const focusable = event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex="0"]');
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}
    onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="task-checklist-shell">
      <header className="transcript-header">
        <div><span className="eyebrow">Implementation · OpenSpec</span><h2 id="task-checklist-title"><ListChecks />Task checklist</h2></div>
        <button className="icon-button" type="button" aria-label="Close task checklist" onClick={onClose} autoFocus><X /></button>
      </header>
      {progress && <div className="task-checklist-summary">
        <div><strong>{progress.completed} of {progress.total} done</strong><span>{progress.total - progress.completed} remaining</span></div>
        <progress max={progress.total || 1} value={progress.completed} aria-label="Completed tasks" />
        <p>Updated <time dateTime={progress.observedAt}>{new Date(progress.observedAt).toLocaleString([], {dateStyle:"medium",timeStyle:"short"})}</time> · Updated by the author</p>
      </div>}
      {error && <div className="task-checklist-error" role="alert"><p>{error}</p>
        {data && <p>Showing the last loaded checklist.</p>}
        <button type="button" className="transcript-action" onClick={() => setRetry(value => value + 1)}>Try again</button>
      </div>}
      {!data && !error && <div className="task-checklist-empty" role="status"><SpinnerGap className="spin" />Loading tasks…</div>}
      {data && <>
        <div className="task-checklist-filters" role="group" aria-label="Filter tasks">
          {([['all','All',progress?.total ?? 0],['remaining','Remaining',progress ? progress.total-progress.completed : 0],['done','Done',progress?.completed ?? 0]] as const)
            .map(([value,label,count]) => <button key={value} type="button" aria-pressed={filter === value}
              onClick={() => setFilter(value)}>{label}<span>{count}</span></button>)}
        </div>
        <div className="task-checklist-body" role="region" aria-label="Task list" tabIndex={0}>
          {sections.map((section,index) => <section className="task-checklist-section" key={`${section.title}:${index}`}>
            <h3>{section.title}</h3>
            <ul>{section.tasks.map(task => <li key={task.line} className={task.completed ? "is-done" : ""}>
              <span className="task-checklist-box" aria-hidden="true">{task.completed && <Check weight="bold" />}</span>
              <div><span className="sr-only">{task.completed ? "Done: " : "Not done: "}</span>
                {task.text.split(/(`[^`]+`)/g).map((text,index) => text.startsWith('`') && text.endsWith('`')
                  ? <code key={index}>{text.slice(1,-1)}</code> : text)}</div>
            </li>)}</ul>
          </section>)}
          {!sections.length && <p className="task-checklist-empty">{filter === "done" ? "No tasks completed yet." : filter === "remaining" && progress?.total ? "All checklist tasks are done." : "The author is preparing the checklist."}</p>}
        </div>
      </>}
    </div>
  </dialog>, document.body);
}
