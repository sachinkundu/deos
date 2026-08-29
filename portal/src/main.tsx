import { StrictMode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowClockwise,
  ArrowRight,
  ArrowUUpLeft,
  Check,
  Clock,
  Gear,
  GithubLogo,
  GitPullRequest,
  MagnifyingGlass,
  Moon,
  ArrowSquareOut,
  SpinnerGap,
  Sun,
  WarningCircle,
} from "@phosphor-icons/react";
import { applyStaged, receivePoll, type PollState } from "./polling.ts";
import { directionalClaimPresentation } from "./directional-claim.ts";
import { portalPageFromPath, portalPathForPage, reviewRunIdFromPath, type PortalPage } from "./routes.ts";
import { TranscriptViewer } from "./TranscriptViewer.tsx";
import type { TranscriptDto } from "./transcript-view.ts";
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
  attempts: Array<{ id: string; state: string; outcome: string | null; startedAt: string; endedAt: string | null; transcriptAvailable: boolean }>;
  waits: Array<{ state: string; startedAt: string; endedAt: string | null }>;
  links: Array<{ kind: string; label: string; url: string; createdAt: string }>;
}
interface Projection {
  run: Run & { freshness: string };
  stages: Stage[];
  history: Visit[];
  unlinked: { attempts: number; waits: number };
  reviewAvailable: boolean;
  pullRequest: { number: number; url: string; status: string; verified: boolean } | null;
}
interface RepositorySettings {
  projectId: string;
  repository: string;
  revision: number;
  updatedBy: string;
  updatedAt: string;
  dispatchEnabled: boolean;
  workflowRevision: number;
  workflowUpdatedBy: string;
  workflowUpdatedAt: string;
  independentReviewProvider: "openrouter";
  independentReviewModel: string | null;
  independentReviewRevision: number;
  independentReviewUpdatedBy: string;
  independentReviewUpdatedAt: string;
  activeRuns: number;
}
interface IndependentReviewSettings { settings: RepositorySettings; models: string[] }

const api = async <T,>(path: string, signal?: AbortSignal): Promise<T> => {
  if (import.meta.env.DEV) {
    const { demoApi } = await import("./demo.ts");
    return demoApi(path) as T;
  }
  const response = await fetch(path, { signal, headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(response.status === 404 ? "No matching workflow was found." : "The portal could not refresh its data.");
  return response.json() as Promise<T>;
};

const saveRepository = async (repository: string, expectedRevision: number): Promise<RepositorySettings> => {
  const response = await fetch("/api/settings/repository", {
    method: "PUT",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ repository, expectedRevision }),
  });
  const body = await response.json() as RepositorySettings & { error?: string };
  if (!response.ok) {
    const messages: Record<string, string> = {
      active_run: "A workflow is active. Wait for it to finish before changing the repository.",
      stale_revision: "This setting changed in another session. Reload it and try again.",
      invalid_repository: "Use the exact owner/repository format.",
    };
    throw new Error(messages[body.error ?? ""] ?? "The repository could not be saved.");
  }
  return body;
};

const saveWorkflowControls = async (
  dispatchEnabled: boolean,
  expectedRevision: number,
): Promise<RepositorySettings> => {
  const response = await fetch("/api/settings/workflow", {
    method: "PUT",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ dispatchEnabled, expectedRevision }),
  });
  const body = await response.json() as RepositorySettings & { error?: string };
  if (!response.ok) {
    const messages: Record<string, string> = {
      active_run: "A workflow is active. Wait for it to finish before changing these controls.",
      stale_workflow_revision: "These controls changed in another session. Reload them and try again.",
    };
    throw new Error(messages[body.error ?? ""] ?? "The workflow controls could not be saved.");
  }
  return body;
};

const saveIndependentReviewModel = async (
  model: string,
  expectedRevision: number,
): Promise<IndependentReviewSettings> => {
  const response = await fetch("/api/settings/independent-review", {
    method: "PUT",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ model, expectedRevision }),
  });
  const body = await response.json() as IndependentReviewSettings & { error?: string };
  if (!response.ok) {
    const messages: Record<string, string> = {
      active_run: "A workflow is active. Wait for it to finish before changing the review model.",
      stale_independent_review_revision: "The review model changed in another session. Reload it and try again.",
      invalid_independent_review_model: "Choose a supported OpenRouter review model.",
    };
    throw new Error(messages[body.error ?? ""] ?? "The review model could not be saved.");
  }
  return body;
};

const formatTime = (value: string | null): string => value === null
  ? "—"
  : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

const formatDuration = (startedAt: string, endedAt: string | null): string => {
  if (endedAt === null) return "In progress";
  const milliseconds = new Date(endedAt).valueOf() - new Date(startedAt).valueOf();
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return "—";
  const seconds = Math.round(milliseconds / 1_000);
  if (seconds < 60) return `${seconds} sec`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return remainingSeconds === 0 ? `${minutes} min` : `${minutes} min ${remainingSeconds} sec`;
};

const bettaViewUrl = (pullRequestUrl: string): string =>
  `https://bettaview.voxdez.com/?pr=${encodeURIComponent(pullRequestUrl)}`;

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

function SettingsPanel() {
  const [settings, setSettings] = useState<RepositorySettings | null>(null);
  const [repository, setRepository] = useState("");
  const [dispatchEnabled, setDispatchEnabled] = useState(false);
  const [independentModel, setIndependentModel] = useState("");
  const [independentModels, setIndependentModels] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(true);

  const load = useCallback(async () => {
    setBusy(true);
    setMessage("");
    try {
      const [value, independent] = await Promise.all([
        api<RepositorySettings>("/api/settings/repository"),
        api<IndependentReviewSettings>("/api/settings/independent-review"),
      ]);
      setSettings(value);
      setRepository(value.repository);
      setDispatchEnabled(value.dispatchEnabled);
      setIndependentModels(independent.models);
      setIndependentModel(independent.settings.independentReviewModel ?? independent.models[0] ?? "");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Settings could not be loaded.");
    } finally { setBusy(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (settings === null) return;
    setBusy(true);
    setMessage("");
    try {
      const value = await saveRepository(repository, settings.revision);
      setSettings(value);
      setRepository(value.repository);
      setDispatchEnabled(value.dispatchEnabled);
      setMessage("Saved and read back from D1.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The repository could not be saved.");
    } finally { setBusy(false); }
  };

  const saveControls = async () => {
    if (settings === null) return;
    setBusy(true);
    setMessage("");
    try {
      const value = await saveWorkflowControls(dispatchEnabled, settings.workflowRevision);
      setSettings(value);
      setDispatchEnabled(value.dispatchEnabled);
      setMessage("Workflow controls saved and read back from D1.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The workflow controls could not be saved.");
    } finally { setBusy(false); }
  };

  const saveReviewModel = async () => {
    if (settings === null || independentModel.length === 0) return;
    setBusy(true);
    setMessage("");
    try {
      const value = await saveIndependentReviewModel(
        independentModel,
        settings.independentReviewRevision,
      );
      setSettings(value.settings);
      setIndependentModels(value.models);
      setIndependentModel(value.settings.independentReviewModel ?? "");
      setMessage("Independent review model saved and read back from D1.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The review model could not be saved.");
    } finally { setBusy(false); }
  };

  const controlsChanged = settings !== null && dispatchEnabled !== settings.dispatchEnabled;
  const controlsLocked = busy || settings === null || settings.activeRuns > 0;

  return <section className="settings-page">
    <div className="settings-heading"><div><span className="eyebrow">Project settings</span><h1>Workflow settings</h1><p>Choose the repository and control when new workflow work starts.</p></div><GithubLogo /></div>
    <div className="settings-grid">
      <div className="settings-stack">
        <div className="settings-card">
          <label htmlFor="repository">GitHub repository</label>
          <input id="repository" value={repository} onChange={(event) => setRepository(event.target.value)} placeholder="owner/repository" disabled={busy || settings === null} />
          <p>Use the exact <code>owner/repository</code> name. The base branch must be <code>main</code>.</p>
          <div className="settings-actions"><button type="button" onClick={() => void save()} disabled={busy || settings === null || repository.trim() === settings.repository}>{busy ? "Working…" : "Save repository"}</button></div>
        </div>
        <div className="settings-card controls-card">
          <div className="card-heading"><div><h2>Workflow controls</h2><p>This setting applies to new Todo events only.</p></div><span className={settings?.activeRuns ? "guard active" : "guard"}>{settings?.activeRuns ? "Locked" : "Ready"}</span></div>
          <label className="switch-row">
            <span><strong>Workflow dispatch</strong><small>Let accepted Todo events start a workflow.</small></span>
            <input type="checkbox" checked={dispatchEnabled} onChange={(event) => setDispatchEnabled(event.target.checked)} disabled={controlsLocked} />
          </label>
          {settings !== null && settings.activeRuns > 0 && <p className="guard-note">A workflow is active. These controls will unlock when it ends.</p>}
          <div className="settings-actions"><button type="button" onClick={() => void saveControls()} disabled={controlsLocked || !controlsChanged}>{busy ? "Working…" : "Save workflow controls"}</button><button className="secondary" type="button" onClick={() => void load()} disabled={busy}>Reload</button></div>
          {message && <div className="settings-message" role="status">{message}</div>}
        </div>
        <div className="settings-card">
          <div className="card-heading"><div><h2>Independent review</h2><p>This OpenRouter model is frozen into each new traceability run.</p></div><span className={settings?.activeRuns ? "guard active" : "guard"}>{settings?.activeRuns ? "Locked" : "Ready"}</span></div>
          <label htmlFor="independent-review-model">Review model</label>
          <select id="independent-review-model" value={independentModel} onChange={(event) => setIndependentModel(event.target.value)} disabled={controlsLocked}>
            {independentModels.map((model) => <option value={model} key={model}>{model}</option>)}
          </select>
          <p>The OpenRouter key stays in the trusted Worker. It is never shown here or sent to a review Sandbox.</p>
          <div className="settings-actions"><button type="button" onClick={() => void saveReviewModel()} disabled={controlsLocked || independentModel.length === 0 || independentModel === settings?.independentReviewModel}>{busy ? "Working…" : "Save review model"}</button></div>
        </div>
      </div>
      <div className="connection-card">
        <h2>Details</h2>
        <dl>
          <div><dt>Active runs</dt><dd>{settings?.activeRuns ?? "—"}</dd></div>
          <div><dt>Controls saved</dt><dd>{settings ? formatTime(settings.workflowUpdatedAt) : "—"}</dd></div>
          <div><dt>Controls saved by</dt><dd>{settings?.workflowUpdatedBy ?? "—"}</dd></div>
          <div><dt>Repository saved</dt><dd>{settings ? formatTime(settings.updatedAt) : "—"}</dd></div>
          <div><dt>Repository saved by</dt><dd>{settings?.updatedBy ?? "—"}</dd></div>
          <div><dt>Review model</dt><dd>{settings?.independentReviewModel ?? "Not set"}</dd></div>
          <div><dt>Review model saved</dt><dd>{settings ? formatTime(settings.independentReviewUpdatedAt) : "—"}</dd></div>
        </dl>
        <a href="https://github.com/settings/installations" target="_blank" rel="noreferrer">Manage GitHub App access <ArrowSquareOut /></a>
        <p>GitHub App access is granted in GitHub. Saving this page does not add new GitHub permission.</p>
      </div>
    </div>
  </section>;
}

interface ReviewArtifact { name: string; url: string; sha256: string; byteSize: number }
interface ReviewEvent {
  id: string;
  inputId: string;
  stage: string;
  mode: string;
  round: number;
  reviewedHeadSha: string | null;
  author: { provider: string; model: string };
  reviewer: { provider: string; model: string; reasoning: string };
  findingSetDigest: string | null;
  outcome: string;
  reusedFromReviewId: string | null;
  conflictingReviewId: string | null;
  completedAt: string | null;
  artifacts: ReviewArtifact[];
}
interface ReviewProjection {
  run: Record<string, unknown>;
  phases: Array<{ round: number; stage: string; state: string; sharedRepairTurns: number; reviewJobs: number; proofRepairs: number; reviewedHeadSha: string | null }>;
  candidates: Array<{
    id: string;
    round: number;
    digest: string;
    state: string;
    createdAt: string;
    reviewDispositions: Array<{
      itemId: string;
      status: "applied" | "declined" | "no_change";
      reason: string;
    }>;
    reviewContextId: string | null;
  }>;
  reviews: ReviewEvent[];
  headBindings: Array<Record<string, unknown>>;
}

function ReviewTracePage({ runId }: { runId: string }) {
  const [trace, setTrace] = useState<ReviewProjection | null>(null);
  const [inventories, setInventories] = useState<Record<string, Record<string, unknown>>>({});
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void api<ReviewProjection>(`/api/runs/${encodeURIComponent(runId)}/review`, controller.signal)
      .then(async (value) => {
        setTrace(value);
        const loaded = await Promise.all(value.reviews.map(async (review) => {
          const artifact = review.artifacts.find((item) => item.name === "candidate-inventory.json");
          if (artifact === undefined) return [review.id, {}] as const;
          return [review.id, await api<Record<string, unknown>>(artifact.url, controller.signal)] as const;
        }));
        setInventories(Object.fromEntries(loaded));
      })
      .catch((cause) => {
        if (!(cause instanceof DOMException && cause.name === "AbortError")) {
          setError(cause instanceof Error ? cause.message : "The review trace could not be loaded.");
        }
      });
    return () => controller.abort();
  }, [runId]);
  if (error) return <section className="empty-state"><WarningCircle /><h1>Review trace unavailable</h1><p>{error}</p></section>;
  if (trace === null) return <section className="empty-state"><SpinnerGap className="spin" /><h1>Loading review trace</h1></section>;
  const liveHead = typeof trace.run.head_sha === "string" ? trace.run.head_sha : null;
  const issueKey = typeof trace.run.issue_key === "string" ? trace.run.issue_key : "Linear issue";
  const issueTitle = typeof trace.run.title === "string" ? trace.run.title : "";
  const issueUrl = typeof trace.run.linear_url === "string" ? trace.run.linear_url : null;
  const pullRequestUrl = typeof trace.run.pull_request_url === "string" ? trace.run.pull_request_url : null;
  const latestCandidate = trace.candidates.at(-1) ?? null;
  return <section className="review-page">
    <div className="settings-heading"><div><span className="eyebrow">Internal review proof</span><h1>OpenSpec traceability review</h1><p>This page shows accepted D1 state and hash-checked R2 evidence for the run.</p></div><GitPullRequest /></div>
    <article className="settings-card">
      <div className="card-heading"><div><span className="eyebrow">Reviewed work</span><h2>{issueKey}: {issueTitle}</h2></div><span className="guard">{String(trace.run.status ?? "unknown")}</span></div>
      <dl><div><dt>Run</dt><dd><code>{runId}</code></dd></div><div><dt>Current PR head</dt><dd><code>{liveHead?.slice(0, 12) ?? "Not published"}</code></dd></div><div><dt>Current plan</dt><dd><code>{latestCandidate?.digest.slice(0, 16) ?? "—"}</code></dd></div><div><dt>Head bindings</dt><dd>{trace.headBindings.length}</dd></div></dl>
      <div className="review-artifacts">{issueUrl && <a href={issueUrl} target="_blank" rel="noreferrer">Open Linear issue <ArrowSquareOut /></a>}{pullRequestUrl && <a href={pullRequestUrl} target="_blank" rel="noreferrer">Open planning PR <ArrowSquareOut /></a>}</div>
    </article>
    <div className="review-summary-grid">
      {trace.phases.map((phase) => <article className="review-phase" key={`${phase.round}:${phase.stage}`}>
        <span className="eyebrow">Round {phase.round} · {human(phase.stage)}</span>
        <h2>{human(phase.state)}</h2>
        <dl><div><dt>Review jobs</dt><dd>{phase.reviewJobs}</dd></div><div><dt>{phase.stage === "self_check" ? "Self-check repairs" : "Semantic repair loops"}</dt><dd>{phase.stage === "self_check" ? `${phase.sharedRepairTurns} / 3` : "None"}</dd></div><div><dt>Proof repairs</dt><dd>{phase.proofRepairs}</dd></div></dl>
      </article>)}
    </div>
    <ol className="review-timeline">{trace.reviews.map((review, index) => {
      const inventory = inventories[review.id] ?? {};
      const findings = Array.isArray(inventory.findings) ? inventory.findings as Array<Record<string, unknown>> : [];
      const resolutions = Array.isArray(inventory.resolutions) ? inventory.resolutions as Array<Record<string, unknown>> : [];
      const directionalClaims = Array.isArray(inventory.directionalClaims) ? inventory.directionalClaims as Array<Record<string, unknown>> : [];
      const responseCandidate = trace.candidates.find((candidate) => candidate.reviewContextId === review.id);
      const dispositions = responseCandidate?.reviewDispositions ?? [];
      const headChanged = review.reviewedHeadSha !== null && liveHead !== null && review.reviewedHeadSha !== liveHead;
      const stale = headChanged && responseCandidate === undefined;
      return <li key={review.id} className={`review-event ${review.outcome}`}>
        <div className="review-event-index">{index + 1}</div>
        <div className="review-event-body">
          <div className="card-heading"><div><span className="eyebrow">Round {review.round} · {human(review.stage)} · {human(review.mode)}</span><h2>{human(review.outcome)}</h2></div><span className="guard">{review.reusedFromReviewId ? "Reused · no model call" : stale ? "Stale head" : headChanged ? "Author response head" : review.reviewedHeadSha === null ? review.reviewer.provider : "Current head"}</span></div>
          <p>Author {review.author.model} · Reviewer {review.reviewer.model} · {review.reviewer.reasoning}</p>
          {review.stage === "independent" && <p className="guard-note">Complete means the external review ran and its evidence was saved. Its concerns do not fail the workflow. The author responds, then a human judges the plan.</p>}
          <dl><div><dt>Input</dt><dd><code>{review.inputId.slice(0, 16)}…</code></dd></div><div><dt>Finding set</dt><dd><code>{review.findingSetDigest?.slice(0, 16) ?? "Discovery pending"}</code></dd></div><div><dt>Head</dt><dd><code>{review.reviewedHeadSha?.slice(0, 12) ?? "pre-publish"}</code></dd></div><div><dt>Finished</dt><dd>{review.completedAt ? formatTime(review.completedAt) : "—"}</dd></div></dl>
          {stale && <p className="guard-note">This proof is for {review.reviewedHeadSha?.slice(0, 12)}. The pull request is now at {liveHead?.slice(0, 12)}.</p>}
          {headChanged && responseCandidate && <p className="guard-note">The outside review remains bound to {review.reviewedHeadSha?.slice(0, 12)}. The current head contains the linked author response.</p>}
          {findings.length > 0 && <div className="review-findings"><h3>{review.stage === "independent" ? "Review concerns" : "Fixed finding set"}</h3>{findings.map((finding) => {
            const resolution = resolutions.find((item) => item.findingId === finding.id);
            const disposition = dispositions.find((item) => item.itemId === finding.id);
            const ranges = Array.isArray(finding.allowedRanges) ? finding.allowedRanges as Array<Record<string, unknown>> : [];
            const currentEvidence = Array.isArray(resolution?.currentEvidence) ? resolution.currentEvidence as Array<Record<string, unknown>> : [];
            return <article key={String(finding.id)}><strong>{String(finding.id)}</strong><span>{human(String(disposition?.status ?? resolution?.status ?? "awaiting author"))}</span><p>{String(finding.message ?? "")}</p>
              {typeof resolution?.rationale === "string" && <p>{resolution.rationale}</p>}
              {disposition && <p><strong>Author:</strong> {disposition.reason}</p>}
              <div className="review-artifacts">{ranges.map((range, rangeIndex) => <code key={`source-${rangeIndex}`}>{String(range.path)}:{String(range.startLine)}-{String(range.endLine)}</code>)}{currentEvidence.map((range, rangeIndex) => <code key={`current-${rangeIndex}`}>Now {String(range.path)}:{String(range.startLine)}-{String(range.endLine)}</code>)}</div>
            </article>;
          })}</div>}
          {directionalClaims.length > 0 && <div className="review-findings"><h3>Directional relationship evidence</h3>{directionalClaims.map((claim) => {
            const disposition = dispositions.find((item) => item.itemId === claim.id);
            const presentation = directionalClaimPresentation(claim);
            return <article key={String(claim.id)}>
              <strong>{String(claim.id)}</strong><span>{disposition ? human(String(disposition.status)) : presentation.label}</span>
              {disposition && <p><strong>{presentation.label}</strong></p>}
              {presentation.details.map((detail, detailIndex) => <p key={detailIndex}>{detail.label && <strong>{detail.label}: </strong>}{detail.rationale}</p>)}
              {disposition && <p><strong>Author:</strong> {disposition.reason}</p>}
            </article>;
          })}</div>}
          {review.conflictingReviewId && <p className="guard-note">This result conflicts with {review.conflictingReviewId}. Human judgment is required.</p>}
          <div className="review-artifacts">{review.artifacts.map((artifact) => <a href={artifact.url} key={artifact.name} target="_blank" rel="noreferrer">{artifact.name} <ArrowSquareOut /></a>)}</div>
        </div>
      </li>;
    })}</ol>
  </section>;
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
  const [transcriptAttempt, setTranscriptAttempt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState<PortalPage>(() => portalPageFromPath(window.location.pathname));
  const requestRef = useRef<AbortController | null>(null);
  const workflowLoadedRef = useRef(false);
  const loadTranscript = useCallback((path: string, signal?: AbortSignal) => api<TranscriptDto>(path, signal), []);

  useEffect(() => {
    localStorage.setItem("deos-theme", theme);
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    const restoreRoute = () => setPage(portalPageFromPath(window.location.pathname));
    window.addEventListener("popstate", restoreRoute);
    return () => window.removeEventListener("popstate", restoreRoute);
  }, []);

  const navigate = useCallback((next: Exclude<PortalPage, "not-found" | "review">) => {
    const path = portalPathForPage(next);
    if (window.location.pathname !== path) window.history.pushState({}, "", path);
    setPage(next);
  }, []);

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
      setTranscriptAttempt(null);
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

  useEffect(() => {
    if (page !== "workflow" || workflowLoadedRef.current) return;
    workflowLoadedRef.current = true;
    void search();
  }, [page]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (page !== "workflow" || !runId) return;
    const tick = () => { if (document.visibilityState === "visible") void loadProjection(runId); };
    const timer = window.setInterval(tick, 5_000);
    document.addEventListener("visibilitychange", tick);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", tick); requestRef.current?.abort(); };
  }, [loadProjection, page, runId]);

  const projection = poll.applied;
  const detail = useMemo(() => projection?.history.find((visit) => visit.sequence === selectedVisit) ?? projection?.history.at(-1) ?? null, [projection, selectedVisit]);
  const transcriptAttempts = detail?.attempts.filter((attempt) => attempt.transcriptAvailable) ?? [];
  const firstRow = projection?.stages.slice(0, 4) ?? [];
  const secondRow = [...(projection?.stages.slice(4) ?? [])].reverse();

  return <div className="shell">
    <header className="topbar">
      <div className="brand"><span className="brand-mark">D</span><div><strong>DEOS</strong><small>Workflow portal</small></div></div>
      <div className="topbar-meta"><span className="secure-dot" />Access protected<a className="settings-nav" href="/"><Gear />Workflows</a><ThemeControl theme={theme} setTheme={setTheme} /></div>
    </header>
    {page === "workflow" && <aside className="rail">
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
    </aside>}
    <main className={page !== "workflow" ? "main settings-main" : "main"}>
      {page === "settings" ? <SettingsPanel /> : page === "review" ? <ReviewTracePage runId={reviewRunIdFromPath(window.location.pathname) ?? ""} /> : page === "not-found" ? <section className="empty-state"><WarningCircle /><h1>Page not found</h1><p>This portal route is not registered.</p><button className="route-action" type="button" onClick={() => navigate("workflow")}>Go to workflows</button></section> : <>
      {poll.staged && <div className="update-banner"><span><ArrowClockwise /> Confirmed workflow data is ready.</span><button type="button" onClick={() => setPoll(applyStaged)}>Apply update</button></div>}
      {poll.error && <div className="error-banner"><WarningCircle />{poll.error}<button type="button" onClick={() => runId && void loadProjection(runId)}>Retry</button></div>}
      {selectedIssue && <section className="issue-header">
        <div><span className="eyebrow">{selectedIssue.key}</span><h1>{selectedIssue.title}</h1><a href={selectedIssue.url} target="_blank" rel="noreferrer">Open issue <ArrowSquareOut /></a></div>
        <div className="run-control"><label htmlFor="run">Workflow run</label><select id="run" value={runId} onChange={(event) => { setRunId(event.target.value); setSelectedVisit(null); setTranscriptAttempt(null); void loadProjection(event.target.value, true); }}>{runs.map((run) => <option value={run.id} key={run.id}>Run {run.sequence} · {human(run.status)}</option>)}</select></div>
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
              <dl><div><dt>Started</dt><dd>{formatTime(detail.enteredAt)}</dd></div><div><dt>Duration</dt><dd>{formatDuration(detail.enteredAt, detail.leftAt)}</dd></div></dl>
              {(transcriptAttempts.length > 0 || detail.links.length > 0) && <div className="evidence-grid">
                {transcriptAttempts.length > 0 && <div><h3>Transcript</h3>{transcriptAttempts.map((attempt) => <div className="attempt-row" key={attempt.id}><button type="button" onClick={() => setTranscriptAttempt(attempt.id)}>View transcript</button></div>)}</div>}
                {detail.links.length > 0 && <div><h3>Links</h3>{detail.links.map((link) => <a key={link.url} href={link.url} target="_blank" rel="noreferrer"><GitPullRequest />{link.label}</a>)}</div>}
              </div>}
              {detail.stageId === "planning" && projection.pullRequest && <div className="planning-pr-actions">
                <a className="review-trace-link" href={projection.pullRequest.url} target="_blank" rel="noreferrer">Open on GitHub <ArrowSquareOut /></a>
                <a className="review-trace-link" href={bettaViewUrl(projection.pullRequest.url)} target="_blank" rel="noreferrer">Open in BettaView <ArrowSquareOut /></a>
              </div>}
            </div>}
          </section>
          <section className="history-panel">
            <div className="section-heading"><div><span className="eyebrow">Chronology</span><h2>Visit history</h2></div><span>{projection.history.length} visits</span></div>
            <ol className="history-list">{[...projection.history].reverse().map((visit) => <li key={visit.sequence}><button type="button" className={detail?.sequence === visit.sequence ? "selected" : ""} onClick={() => setSelectedVisit(visit.sequence)}><span className="history-number">{visit.sequence}</span><span><strong>{visit.label}</strong><small>{formatTime(visit.enteredAt)}{visit.cycle > 1 ? ` · cycle ${visit.cycle}` : ""}</small></span><span className="history-state">{human(visit.state)}</span></button></li>)}</ol>
          </section>
        </div>
      </> : <section className="empty-state">{busy ? <><SpinnerGap className="spin" /><h1>Loading durable workflow state</h1></> : <><MagnifyingGlass /><h1>Find a DEOS workflow</h1><p>Search for a Linear issue key to inspect its workflow runs and durable business state.</p></>}</section>}</>}
    </main>
    {transcriptAttempt !== null && <TranscriptViewer attemptId={transcriptAttempt} loadTranscript={loadTranscript} onClose={() => setTranscriptAttempt(null)} />}
  </div>;
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
