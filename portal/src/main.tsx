import { StrictMode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowClockwise,
  ArrowRight,
  ArrowUUpLeft,
  Check,
  Clock,
  GitPullRequest,
  MagnifyingGlass,
  Moon,
  ArrowSquareOut,
  SpinnerGap,
  Sun,
  WarningCircle,
} from "@phosphor-icons/react";
import { applyStaged, receivePoll, type PollState } from "./polling.ts";
import "./styles.css";

type Theme = "system" | "light" | "dark";
interface Issue { key: string; title: string; url: string; observedAt: string }
interface Run { id: string; sequence: number; status: string; definitionVersion: number; startedAt: string; updatedAt: string; endedAt: string | null }
interface Stage { id: string; label: string; state: "active" | "complete" | "upcoming"; visits: number }
interface Visit {
  sequence: number;
  nodeId: string;
  label: string;
  stageId: string;
  cycle: number;
  state: string;
  enteredAt: string;
  leftAt: string | null;
  attempts: Array<{ state: string; outcome: string | null; startedAt: string; endedAt: string | null }>;
  waits: Array<{ state: string; startedAt: string; endedAt: string | null }>;
  links: Array<{ kind: string; label: string; url: string; createdAt: string }>;
}
interface Projection { run: Run & { freshness: string }; stages: Stage[]; history: Visit[]; unlinked: { attempts: number; waits: number } }

const api = async <T,>(path: string, signal?: AbortSignal): Promise<T> => {
  if (import.meta.env.DEV) {
    const { demoApi } = await import("./demo.ts");
    return demoApi(path) as T;
  }
  const response = await fetch(path, { signal, headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(response.status === 404 ? "No matching workflow was found." : "The portal could not refresh its data.");
  return response.json() as Promise<T>;
};

const formatTime = (value: string | null): string => value === null
  ? "—"
  : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

const human = (value: string): string => value.replaceAll("_", " ");

function ThemeControl({ theme, setTheme }: { theme: Theme; setTheme: (theme: Theme) => void }) {
  return <div className="theme-control" aria-label="Color theme">
    {(["system", "light", "dark"] as const).map((option) => <button
      type="button"
      key={option}
      className={theme === option ? "selected" : ""}
      aria-pressed={theme === option}
      onClick={() => setTheme(option)}
      title={`${option} theme`}
    >{option === "light" ? <Sun /> : option === "dark" ? <Moon /> : <span>Auto</span>}</button>)}
  </div>;
}

function StageCard({ stage, onSelect }: { stage: Stage; onSelect: () => void }) {
  return <button type="button" className={`stage-card ${stage.state}`} onClick={onSelect}>
    <span className="stage-icon">{stage.state === "complete" ? <Check weight="bold" /> : stage.state === "active" ? <SpinnerGap /> : <Clock />}</span>
    <span className="stage-copy"><strong>{stage.label}</strong><small>{stage.state === "active" ? "Active now" : stage.state === "complete" ? "Complete" : "Upcoming"}</small></span>
    {stage.visits > 1 && <span className="cycle"><ArrowUUpLeft /> {stage.visits}</span>}
  </button>;
}

function App() {
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem("deos-theme") as Theme | null) ?? "system");
  const [query, setQuery] = useState(() => localStorage.getItem("deos-issue") ?? "SAC-122");
  const [issues, setIssues] = useState<Issue[]>([]);
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [runId, setRunId] = useState("");
  const [poll, setPoll] = useState<PollState<Projection>>({ applied: null, staged: null, error: null });
  const [selectedVisit, setSelectedVisit] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => {
    localStorage.setItem("deos-theme", theme);
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const loadProjection = useCallback(async (selectedRun: string, initial = false) => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    try {
      const next = await api<Projection>(`/api/runs/${encodeURIComponent(selectedRun)}`, controller.signal);
      setPoll((current) => initial ? { applied: next, staged: null, error: null } : receivePoll(current, next));
      setSelectedVisit((current) => current ?? next.history.at(-1)?.sequence ?? null);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setPoll((current) => ({ ...current, error: error instanceof Error ? error.message : "Refresh failed." }));
      }
    }
  }, []);

  const selectIssue = useCallback(async (issue: Issue) => {
    setBusy(true);
    setSelectedIssue(issue);
    localStorage.setItem("deos-issue", issue.key);
    try {
      const result = await api<{ issue: Issue; runs: Run[] }>(`/api/issues/${issue.key}/runs`);
      setRuns(result.runs);
      const first = result.runs[0]?.id ?? "";
      setRunId(first);
      setSelectedVisit(null);
      setPoll({ applied: null, staged: null, error: null });
      if (first) await loadProjection(first, true);
    } catch (error) {
      setPoll({ applied: null, staged: null, error: error instanceof Error ? error.message : "Issue lookup failed." });
    } finally { setBusy(false); }
  }, [loadProjection]);

  const search = useCallback(async () => {
    setBusy(true);
    try {
      const result = await api<{ issues: Issue[] }>(`/api/issues?query=${encodeURIComponent(query)}`);
      setIssues(result.issues);
      const exact = result.issues.find((issue) => issue.key === query.trim().toUpperCase());
      if (exact) await selectIssue(exact);
    } catch (error) {
      setPoll((current) => ({ ...current, error: error instanceof Error ? error.message : "Issue search failed." }));
    } finally { setBusy(false); }
  }, [query, selectIssue]);

  useEffect(() => { void search(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!runId) return;
    const tick = () => { if (document.visibilityState === "visible") void loadProjection(runId); };
    const timer = window.setInterval(tick, 5_000);
    document.addEventListener("visibilitychange", tick);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", tick); requestRef.current?.abort(); };
  }, [loadProjection, runId]);

  const projection = poll.applied;
  const detail = useMemo(() => projection?.history.find((visit) => visit.sequence === selectedVisit) ?? projection?.history.at(-1) ?? null, [projection, selectedVisit]);
  const firstRow = projection?.stages.slice(0, 4) ?? [];
  const secondRow = [...(projection?.stages.slice(4) ?? [])].reverse();

  return <div className="shell">
    <header className="topbar">
      <div className="brand"><span className="brand-mark">D</span><div><strong>DEOS</strong><small>Workflow portal</small></div></div>
      <div className="topbar-meta"><span className="secure-dot" />Read-only business state<ThemeControl theme={theme} setTheme={setTheme} /></div>
    </header>
    <aside className="rail">
      <form onSubmit={(event) => { event.preventDefault(); void search(); }} className="search-form">
        <label htmlFor="issue-search">Linear issue</label>
        <div className="search-input"><MagnifyingGlass /><input id="issue-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="SAC-101" autoComplete="off" /><button aria-label="Search" type="submit"><ArrowRight /></button></div>
      </form>
      <div className="issue-list" aria-live="polite">
        {issues.map((issue) => <button key={issue.key} type="button" className={selectedIssue?.key === issue.key ? "issue selected" : "issue"} onClick={() => void selectIssue(issue)}>
          <span className="issue-key">{issue.key}</span><strong>{issue.title}</strong><small>Observed {formatTime(issue.observedAt)}</small>
        </button>)}
        {!busy && issues.length === 0 && <p className="empty-small">Search by an issue key with a durable DEOS run.</p>}
      </div>
    </aside>
    <main className="main">
      {poll.staged && <div className="update-banner"><span><ArrowClockwise /> Confirmed workflow data is ready.</span><button type="button" onClick={() => setPoll(applyStaged)}>Apply update</button></div>}
      {poll.error && <div className="error-banner"><WarningCircle />{poll.error}<button type="button" onClick={() => runId && void loadProjection(runId)}>Retry</button></div>}
      {selectedIssue && <section className="issue-header">
        <div><span className="eyebrow">{selectedIssue.key}</span><h1>{selectedIssue.title}</h1><a href={selectedIssue.url} target="_blank" rel="noreferrer">Open issue <ArrowSquareOut /></a></div>
        <div className="run-control"><label htmlFor="run">Workflow run</label><select id="run" value={runId} onChange={(event) => { setRunId(event.target.value); setSelectedVisit(null); void loadProjection(event.target.value, true); }}>{runs.map((run) => <option value={run.id} key={run.id}>Run {run.sequence} · {human(run.status)}</option>)}</select></div>
      </section>}
      {projection ? <>
        <section className="status-strip"><div><span className={`status-pill ${projection.run.status}`}>{human(projection.run.status)}</span><span>Definition v{projection.run.definitionVersion}</span></div><span>Fresh as of {formatTime(projection.run.freshness)}</span></section>
        <section className="workflow-panel" aria-labelledby="workflow-title">
          <div className="section-heading"><div><span className="eyebrow">Current run</span><h2 id="workflow-title">Workflow map</h2></div><span>Choose a stage to inspect its latest visit</span></div>
          <div className="workflow-map">
            <div className="stage-row">{firstRow.map((stage, index) => <div className="stage-slot" key={stage.id}><StageCard stage={stage} onSelect={() => setSelectedVisit(projection.history.filter((visit) => visit.stageId === stage.id).at(-1)?.sequence ?? null)} />{index < firstRow.length - 1 && <ArrowRight className="connector" />}</div>)}</div>
            {secondRow.length > 0 && <div className="turn"><ArrowUUpLeft /><span>Workflow continues</span></div>}
            <div className="stage-row reverse">{secondRow.map((stage, index) => <div className="stage-slot" key={stage.id}><StageCard stage={stage} onSelect={() => setSelectedVisit(projection.history.filter((visit) => visit.stageId === stage.id).at(-1)?.sequence ?? null)} />{index < secondRow.length - 1 && <ArrowRight className="connector" />}</div>)}</div>
          </div>
        </section>
        <div className="lower-grid">
          <section className="detail-panel">
            <div className="section-heading"><div><span className="eyebrow">Visit detail</span><h2>{detail?.label ?? "No visit selected"}</h2></div>{detail && <span>Visit {detail.sequence}{detail.cycle > 1 ? ` · cycle ${detail.cycle}` : ""}</span>}</div>
            {detail && <div className="detail-content">
              <dl><div><dt>State</dt><dd>{human(detail.state)}</dd></div><div><dt>Entered</dt><dd>{formatTime(detail.enteredAt)}</dd></div><div><dt>Finished</dt><dd>{formatTime(detail.leftAt)}</dd></div></dl>
              <div className="evidence-grid"><div><h3>Agent attempts</h3>{detail.attempts.length ? detail.attempts.map((attempt, index) => <p key={index}>{human(attempt.state)}{attempt.outcome ? ` · ${human(attempt.outcome)}` : ""}</p>) : <p>Unavailable for this visit</p>}</div><div><h3>Wait state</h3>{detail.waits.length ? detail.waits.map((wait, index) => <p key={index}>{human(wait.state)} · {formatTime(wait.startedAt)}</p>) : <p>No durable wait</p>}</div><div><h3>Governed work</h3>{detail.links.length ? detail.links.map((link) => <a key={link.url} href={link.url} target="_blank" rel="noreferrer"><GitPullRequest />{link.label}</a>) : <p>Unavailable for this visit</p>}</div></div>
            </div>}
          </section>
          <section className="history-panel">
            <div className="section-heading"><div><span className="eyebrow">Chronology</span><h2>Visit history</h2></div><span>{projection.history.length} visits</span></div>
            <ol className="history-list">{[...projection.history].reverse().map((visit) => <li key={visit.sequence}><button type="button" className={detail?.sequence === visit.sequence ? "selected" : ""} onClick={() => setSelectedVisit(visit.sequence)}><span className="history-number">{visit.sequence}</span><span><strong>{visit.label}</strong><small>{formatTime(visit.enteredAt)}{visit.cycle > 1 ? ` · cycle ${visit.cycle}` : ""}</small></span><span className="history-state">{human(visit.state)}</span></button></li>)}</ol>
          </section>
        </div>
      </> : <section className="empty-state">{busy ? <><SpinnerGap className="spin" /><h1>Loading durable workflow state</h1></> : <><MagnifyingGlass /><h1>Find a DEOS workflow</h1><p>Search for a Linear issue key to inspect its workflow runs and durable business state.</p></>}</section>}
    </main>
  </div>;
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
