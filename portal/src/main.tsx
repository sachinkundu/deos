import { StrictMode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowClockwise,
  ArrowRight,
  ArrowUUpLeft,
  ArrowsDownUp,
  CaretDown,
  CaretRight,
  Check,
  CheckCircle,
  Clock,
  Eye,
  FileText,
  Gear,
  GithubLogo,
  GitMerge,
  GitPullRequest,
  ListChecks,
  MagnifyingGlass,
  Moon,
  ArrowSquareOut,
  SpinnerGap,
  Sun,
  UserCircle,
  WarningCircle,
} from "@phosphor-icons/react";
import { applyStaged, receivePoll, type PollState } from "./polling.ts";
import { directionalClaimPresentation } from "./directional-claim.ts";
import { portalPageFromPath, portalPathForPage, reviewRunIdFromPath, type PortalPage } from "./routes.ts";
import { bettaViewUrl, pullRequestActions } from "./review-actions.ts";
import { TranscriptViewer } from "./TranscriptViewer.tsx";
import type { TranscriptDto } from "./transcript-view.ts";
import {
  isDesignStageWorkflow,
  isPlanningAuthorVisit,
  latestPhaseId,
  authorVisitStatus,
  approvalEvidenceLinks,
  phaseDisplayStatus,
  phaseForVisit,
  stoppedPhaseSourceId,
  selectedApprovalEvidenceUrls,
  workflowPhases,
  type WorkflowPhaseId,
} from "./workflow-phases.ts";
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
  recovered: boolean;
  state: string;
  enteredAt: string;
  leftAt: string | null;
  attempts: Array<{ id: string; state: string; outcome: string | null; startedAt: string; endedAt: string | null; transcriptAvailable: boolean }>;
  waits: Array<{ state: string; startedAt: string; endedAt: string | null }>;
  links: Array<{ kind: string; label: string; url: string; createdAt: string }>;
  gate: {
    gate_kind: "plan" | "design";
    work_type: "proposal_and_specs" | "design";
    round: number;
    state: string;
    pull_request_number: number;
    pull_request_url: string;
    approved_head_sha: string;
    decision_outcome: string | null;
  } | null;
}
interface Projection {
  run: Run & { freshness: string };
  stages: Stage[];
  history: Visit[];
  unlinked: { attempts: number; waits: number };
  reviewAvailable: boolean;
  retry: { failedAttemptId: string; retryNode: string } | null;
  pullRequest: { number: number; url: string; status: string; verified: boolean } | null;
  workProducts: {
    planning: { number: number; url: string; status: string; verified: boolean } | null;
    design: { number: number; url: string; status: string; headSha: string | null; baseCommit: string } | null;
  };
  gateVisits: Array<{
    visitSequence: number;
    gateKind: "plan" | "design";
    workType: "proposal_and_specs" | "design";
    round: number;
    state: string;
    pullRequest: { number: number; url: string } | null;
    approvedHeadSha: string;
    decision: string | null;
    active: boolean;
  }>;
}
interface RepositoryRoute {
  projectId: string;
  projectName: string;
  repository: string;
  githubInstallationId: string;
  definitionId: string;
  definitionVersion: number;
  definitionDigest: string;
  startStateName: string;
  humanGateStateId: string;
  repositoryRevision: number;
  routeRevision: number;
  routeDigest: string;
  updatedBy: string;
  updatedAt: string;
  dispatchEnabled: boolean;
  workflowRevision: number;
  independentReviewProvider: "openrouter";
  independentReviewModel: string | null;
  independentReviewRevision: number;
  accessState: "unchecked" | "passed" | "missing" | "weak_permissions" | "unavailable";
  accessCheckedAt: string | null;
  accessPermissionsDigest: string | null;
  githubSettingsUrl: string | null;
  activeRuns: number;
}
interface LinearProjectChoice { projectId: string; name: string; url: string; teams: Array<{ id: string; name: string; key: string }> }
interface GitHubRepositoryChoice {
  repositoryId: string;
  fullName: string;
  defaultBranch: string;
  installationId: string;
  accountLogin: string;
  settingsUrl: string;
  access: "ready" | "weak_permissions";
}
interface GitHubInstallationChoice {
  installationId: string;
  accountLogin: string;
  settingsUrl: string;
  suspended: boolean;
  repositories: GitHubRepositoryChoice[];
}
interface RouteAdminOverview {
  routes: RepositoryRoute[];
  linear: { state: "ready" | "unavailable"; values: LinearProjectChoice[] };
  github: { state: "ready" | "unavailable"; values: GitHubInstallationChoice[] };
  supportedReviewModels: string[];
}

const api = async <T,>(path: string, signal?: AbortSignal): Promise<T> => {
  if (import.meta.env.DEV) {
    const { demoApi } = await import("./demo.ts");
    return demoApi(path) as T;
  }
  const response = await fetch(path, { signal, headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(response.status === 404 ? "No matching workflow was found." : "The portal could not refresh its data.");
  return response.json() as Promise<T>;
};

const routeMutation = async <T,>(
  path: string,
  method: "POST" | "PUT",
  input: Record<string, unknown>,
): Promise<T> => {
  const response = await fetch(path, {
    method,
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = await response.json() as T & { error?: string };
  if (!response.ok) {
    const messages: Record<string, string> = {
      stale_repository_revision: "This repository changed in another session. Reload and try again.",
      stale_workflow_revision: "These controls changed in another session. Reload and try again.",
      stale_review_revision: "The review model changed in another session. Reload and try again.",
      github_access_not_ready: "The DEOS GitHub App does not have the access this route needs.",
      provider_unavailable: "A provider list is unavailable. Saved routes are still shown.",
      route_exists: "That Linear project already has a route.",
      project_not_available: "Choose a Linear project from the live list.",
      repository_not_available: "Choose a repository from the live GitHub App list.",
      unsupported_review_model: "Choose a supported review model.",
    };
    throw new Error(messages[body.error ?? ""] ?? "The route could not be saved.");
  }
  return body;
};

const retryMutation = async (
  path: string,
  input: { failedAttemptId: string; retryNode: string },
): Promise<void> => {
  const response = await fetch(path, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = await response.json() as { error?: string };
  if (!response.ok) {
    const messages: Record<string, string> = {
      stage_retry_not_eligible: "This run changed and can no longer be continued from that step.",
      stage_retry_identity_mismatch: "This failed attempt no longer matches the current run.",
      workflow_replacement_not_established: "Cloudflare did not start the continuation yet. Try again safely.",
      workflow_replacement_ambiguous: "Cloudflare did not confirm the continuation. Try again safely.",
    };
    throw new Error(messages[body.error ?? ""] ?? "The workflow could not be continued.");
  }
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

const human = (value: string): string => value.replaceAll("_", " ");

function PullRequestActions({ url, githubLabel }: { url: string; githubLabel: string }) {
  return <>{pullRequestActions(url, githubLabel).map((action) => <a
    key={action.kind}
    href={action.url}
    target="_blank"
    rel="noreferrer"
  >{action.kind === "github" ? <GitPullRequest /> : <Eye />}{action.label}</a>)}</>;
}

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

const latestVisitFor = (visits: Visit[], predicate: (visit: Visit) => boolean): Visit | null =>
  [...visits].reverse().find(predicate) ?? null;

const gateOutcomeLabel = (outcome: string | null): string => outcome === "revision_requested"
  ? "Changes requested"
  : outcome === "merge_authorized" ? "Approved" : human(outcome ?? "waiting");

function TraceabilityWorkflowMap({
  projection,
  selectedVisit,
  onSelectVisit,
  onOpenTranscript,
}: {
  projection: Projection;
  selectedVisit: number | null;
  onSelectVisit: (sequence: number) => void;
  onOpenTranscript: (attemptId: string) => void;
}) {
  const [expandedPhase, setExpandedPhase] = useState<WorkflowPhaseId | null>(null);
  const [expandedSubstep, setExpandedSubstep] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const phases = useMemo(() => workflowPhases(projection.history), [projection.history]);
  const currentPhaseId = latestPhaseId(projection.history);
  const failedPhaseId = stoppedPhaseSourceId(projection.history);
  const currentPhase = phases.find((phase) => phase.id === currentPhaseId) ?? null;
  const detail = projection.history.find((visit) => visit.sequence === selectedVisit) ?? null;
  const detailPhaseId = detail === null ? null : phaseForVisit(detail);
  const inspectedPhaseId = expandedPhase ?? detailPhaseId ?? currentPhaseId;

  useEffect(() => {
    setExpandedPhase(null);
    setExpandedSubstep(null);
    setHistoryOpen(false);
  }, [projection.run.id]);

  const openPhase = (phaseId: WorkflowPhaseId, visits: Visit[]) => {
    const expandable = phaseId === "planning" || phaseId === "approval" || phaseId === "design";
    const next = expandable && expandedPhase !== phaseId ? phaseId : null;
    const latest = visits.at(-1);
    setExpandedPhase(next);
    setExpandedSubstep(next === "planning" ? "planning_author"
      : next === "approval" ? (latest?.gate?.gate_kind === "design" ? "design_review" : "planning_review")
        : next === "design" ? "design_author" : null);
    if (latest !== undefined) onSelectVisit(latest.sequence);
  };

  const planningVisits = phases.find((phase) => phase.id === "planning")?.visits as Visit[] | undefined ?? [];
  const approvalVisits = phases.find((phase) => phase.id === "approval")?.visits as Visit[] | undefined ?? [];
  const designVisits = phases.find((phase) => phase.id === "design")?.visits as Visit[] | undefined ?? [];
  const selfReviewVisits = planningVisits.filter((visit) => [
    "self_discovery", "planning_self_repair", "self_recheck_before_publish", "self_recheck_after_publish",
  ].includes(visit.nodeId));
  const independentVisits = planningVisits.filter((visit) => [
    "independent_discovery", "independent_recheck", "planning_independent_response", "final_trace",
  ].includes(visit.nodeId));
  const planningAuthorVisit = latestVisitFor(planningVisits, isPlanningAuthorVisit);
  const planningReviewVisit = latestVisitFor(approvalVisits, (visit) => visit.nodeId === "planning_review");
  const planningMergeVisit = latestVisitFor(planningVisits, (visit) => ["verify_planning_merge", "merge_planning_pr"].includes(visit.nodeId));
  const designAuthorVisit = latestVisitFor(designVisits, (visit) => ["design_revision_author", "design_author"].includes(visit.nodeId));
  const designReviewVisit = latestVisitFor(approvalVisits, (visit) => visit.nodeId === "design_review");
  const designMergeVisit = latestVisitFor(designVisits, (visit) => visit.nodeId === "merge_design_pr");
  const planningGates = projection.gateVisits.filter((gate) => gate.gateKind === "plan");
  const designGates = projection.gateVisits.filter((gate) => gate.gateKind === "design");
  const approvalLinks = approvalEvidenceLinks(projection.history);
  const selectedApprovalLinks = new Set(selectedApprovalEvidenceUrls(projection.history, selectedVisit));
  const planningProduct = projection.workProducts.planning;
  const designProduct = projection.workProducts.design;
  const planningAuthorStatus = authorVisitStatus(planningAuthorVisit, projection.run.status);
  const designAuthorStatus = authorVisitStatus(designAuthorVisit, projection.run.status);
  const authorStatusClass = (status: typeof planningAuthorStatus): string =>
    status === "In progress" ? "active" : ["Failed", "Blocked"].includes(status) ? "failed" : "";

  const selectSubstep = (id: string, visit: Visit | null) => {
    setExpandedSubstep((current) => current === id ? null : id);
    if (visit !== null) onSelectVisit(visit.sequence);
  };

  const inspectVisit = (visit: Visit) => {
    onSelectVisit(visit.sequence);
    const phaseId = phaseForVisit(visit);
    setExpandedPhase(phaseId);
    setExpandedSubstep(phaseId === "approval"
      ? (visit.gate?.gate_kind === "design" ? "design_review" : "planning_review")
      : null);
  };

  const phaseOutcome = (phaseId: WorkflowPhaseId): string => {
    if (phaseId === "claim") return "Issue claimed";
    if (phaseId === "planning") return planningProduct?.verified ? "Proposal + specs merged" : "Proposal + specs";
    if (phaseId === "approval") return "Planning + design decisions";
    if (phaseId === "design") return designProduct?.status === "Merged" ? "Design merged" : "Design work";
    if (phaseId === "complete") return human(projection.run.status);
    return "Workflow stopped";
  };

  const renderPlanning = () => <div className="phase-drill" aria-label="Planning details">
    <p className="phase-note">Authoring includes self and independent review.</p>
    <button
      type="button"
      className={`phase-substep ${expandedSubstep === "planning_author" ? "selected" : ""}`}
      aria-expanded={expandedSubstep === "planning_author"}
      onClick={() => selectSubstep("planning_author", planningAuthorVisit)}
    >
      <span className="substep-heading"><span className="substep-icon"><UserCircle /></span><strong>Planning author</strong>{expandedSubstep === "planning_author" ? <CaretDown /> : <CaretRight />}</span>
      <span className={`substep-status ${authorStatusClass(planningAuthorStatus)}`}>{planningAuthorStatus}</span>
      {expandedSubstep === "planning_author" && <span className="author-review-details">
        <span><CheckCircle weight="fill" /><strong>Self review</strong><small>{selfReviewVisits.length > 1 ? "Repaired and rechecked" : "All checks passed"}</small></span>
        <span><CheckCircle weight="fill" /><strong>Independent review</strong><small>{independentVisits.length > 1 ? "Response checked" : "Ready for human review"}</small></span>
      </span>}
    </button>
    <div className="approved-edge"><ArrowRight weight="bold" /><span>after Human Review</span></div>
    <button type="button" className={`phase-substep terminal ${expandedSubstep === "planning_merge" ? "selected" : ""}`} onClick={() => selectSubstep("planning_merge", planningMergeVisit)}>
      <span className="substep-heading"><span className="substep-icon"><GitMerge /></span><strong>Merge &amp; verify</strong></span>
      <span className="substep-meta">{planningProduct?.verified ? `Verified via PR #${planningProduct.number}` : "Waiting for checked merge"}</span>
    </button>
  </div>;

  const renderDesign = () => <div className="phase-drill" aria-label="Design details">
    <p className="phase-note">The same design PR is reused across review rounds.</p>
    <button type="button" className={`phase-substep ${expandedSubstep === "design_author" ? "selected" : ""}`} onClick={() => selectSubstep("design_author", designAuthorVisit)}>
      <span className="substep-heading"><span className="substep-icon"><UserCircle /></span><strong>Design author</strong></span>
      <span className={`substep-status ${authorStatusClass(designAuthorStatus)}`}>{designAuthorStatus}</span>
    </button>
    <div className="approved-edge"><ArrowRight weight="bold" /><span>after Human Review</span></div>
    <button type="button" className={`phase-substep terminal ${expandedSubstep === "design_merge" ? "selected" : ""}`} onClick={() => selectSubstep("design_merge", designMergeVisit)}>
      <span className="substep-heading"><span className="substep-icon"><GitMerge /></span><strong>Merge &amp; verify</strong></span>
      <span className="substep-meta">{designProduct?.status === "Merged" ? `Merged via PR #${designProduct.number}` : "Waiting for merge"}</span>
    </button>
  </div>;

  const renderApproval = () => <div className="phase-drill" aria-label="Human Review details">
    <p className="phase-note">Planning and design decisions share this phase.</p>
    <div className="shared-loop" aria-label="Approve forward or return to the author"><ArrowsDownUp weight="bold" /><span><strong>Approve forward</strong><small>Revision returns to the author</small></span></div>
    <button type="button" className={`phase-substep ${expandedSubstep === "planning_review" ? "selected" : ""} ${planningGates.some((gate) => gate.active) ? "active" : ""}`} aria-expanded={expandedSubstep === "planning_review"} onClick={() => selectSubstep("planning_review", planningReviewVisit)}>
      <span className="substep-heading"><span className="substep-icon"><Eye /></span><strong>Planning review</strong>{expandedSubstep === "planning_review" ? <CaretDown /> : <CaretRight />}</span>
      <span className="substep-meta">{planningGates.length} saved visit{planningGates.length === 1 ? "" : "s"}</span>
      <span className="substep-status">{gateOutcomeLabel(planningGates.at(-1)?.decision ?? null)}</span>
      {expandedSubstep === "planning_review" && <span className="author-review-details gate-rounds">{planningGates.map((gate) => <span key={gate.visitSequence}><strong>Round {gate.round}</strong><small>{gateOutcomeLabel(gate.decision)}</small></span>)}</span>}
    </button>
    <button type="button" className={`phase-substep ${expandedSubstep === "design_review" ? "selected" : ""} ${designGates.some((gate) => gate.active) ? "active" : ""}`} aria-expanded={expandedSubstep === "design_review"} onClick={() => selectSubstep("design_review", designReviewVisit)}>
      <span className="substep-heading"><span className="substep-icon"><Eye /></span><strong>Design review</strong>{expandedSubstep === "design_review" ? <CaretDown /> : <CaretRight />}</span>
      <span className="substep-meta">{designGates.length} saved visit{designGates.length === 1 ? "" : "s"}</span>
      <span className="substep-status">{gateOutcomeLabel(designGates.at(-1)?.decision ?? null)}</span>
      {expandedSubstep === "design_review" && <span className="author-review-details gate-rounds">{designGates.map((gate) => <span key={gate.visitSequence}><strong>Round {gate.round}</strong><small>{gateOutcomeLabel(gate.decision)}</small></span>)}</span>}
    </button>
  </div>;

  const inspectedPhase = phases.find((phase) => phase.id === inspectedPhaseId) ?? currentPhase;
  const inspectorStatus = inspectedPhase === null
    ? "Upcoming"
    : phaseDisplayStatus(inspectedPhase, currentPhaseId, projection.run.status, failedPhaseId);
  const inspectorComplete = inspectorStatus === "Complete" || inspectorStatus === "Succeeded" ||
    ["Failed", "Blocked", "Canceled"].includes(inspectorStatus);
  const inspectorTitle = expandedSubstep === "planning_author" ? "Planning author"
    : expandedSubstep === "planning_review" ? "Human review"
      : expandedSubstep === "planning_merge" ? "Merge & verify"
        : expandedSubstep === "design_author" ? "Design author"
          : expandedSubstep === "design_review" ? "Human review"
            : expandedSubstep === "design_merge" ? "Merge & verify"
              : inspectedPhase?.label ?? "Workflow";
  const inspectorProduct = expandedSubstep === "planning_review" ? planningProduct
    : expandedSubstep === "design_review" ? designProduct
      : inspectedPhase?.id === "planning" ? planningProduct : inspectedPhase?.id === "design" ? designProduct : null;
  const inspectorAttempts = detail?.attempts.filter((attempt) => attempt.transcriptAvailable) ?? [];

  return <section className="workflow-panel phase-workflow-panel" aria-labelledby="workflow-title">
    <div className="section-heading phase-heading"><div><span className="eyebrow">Current run</span><h2 id="workflow-title">Workflow map</h2></div><span>Open a phase, then drill into its evidence</span></div>
    <div className="current-step-banner"><span>Current step</span><strong>{currentPhase?.label ?? "Unknown"}</strong></div>
    <div className="phase-workspace">
      <div className="phase-map">
        {phases.filter((phase) => phase.visits.length > 0 || phase.id !== "stopped").map((phase, index) => {
          const expanded = expandedPhase === phase.id;
          const current = currentPhaseId === phase.id;
          const inspecting = inspectedPhaseId === phase.id && inspectedPhaseId !== currentPhaseId;
          const status = phaseDisplayStatus(phase, currentPhaseId, projection.run.status, failedPhaseId);
          const successfulTerminal = status === "Succeeded";
          const phaseComplete = status === "Complete" || successfulTerminal ||
            ["Failed", "Blocked", "Canceled"].includes(status);
          const product = phase.id === "planning" ? planningProduct : phase.id === "design" ? designProduct : null;
          return <article className={`workflow-phase ${expanded ? "expanded" : ""} ${current ? "current" : ""} ${inspecting ? "inspecting" : ""}`} key={phase.id}>
            <span className={`phase-spine-marker ${status === "In progress" ? "active" : ""}`} aria-hidden="true">{["Failed", "Blocked", "Canceled"].includes(status) ? <WarningCircle weight="fill" /> : phaseComplete ? <Check weight="bold" /> : <Clock />}</span>
            <div className="phase-summary-row">
              <button type="button" className="phase-summary" aria-expanded={expanded} onClick={() => openPhase(phase.id, phase.visits as Visit[])}>
                <span className="phase-number">{index + 1}</span>
                <span className="phase-summary-copy"><strong>{phase.label}</strong><small>{phase.visits.length} visit{phase.visits.length === 1 ? "" : "s"} · {phaseOutcome(phase.id)}</small></span>
                <span className={`phase-status ${successfulTerminal ? "succeeded" : ""}`}>{status}</span>
                {inspecting && <span className="inspecting-pill">Inspecting</span>}
                {current && <span className="current-pill">Current step</span>}
                {(phase.id === "planning" || phase.id === "approval" || phase.id === "design") && (expanded ? <CaretDown /> : <CaretRight />)}
              </button>
              {product && <div className="phase-artifacts">
                <a href={product.url} target="_blank" rel="noreferrer"><FileText />{phase.id === "planning" ? "Proposal" : "design.md"}</a>
                {phase.id === "planning" && <a href={product.url} target="_blank" rel="noreferrer"><ListChecks />Specs</a>}
                <PullRequestActions url={product.url} githubLabel={`PR #${product.number}`} />
              </div>}
              {phase.id === "approval" && <div className="phase-artifacts">
                {planningProduct && <PullRequestActions url={planningProduct.url} githubLabel={`Plan PR #${planningProduct.number}`} />}
                {designProduct && <PullRequestActions url={designProduct.url} githubLabel={`Design PR #${designProduct.number}`} />}
              </div>}
            </div>
            {expanded && phase.id === "planning" && renderPlanning()}
            {expanded && phase.id === "approval" && renderApproval()}
            {expanded && phase.id === "design" && renderDesign()}
          </article>;
        })}
      </div>
      <aside className="phase-inspector" aria-label="Inspected workflow detail">
        <span className="eyebrow">{inspectedPhaseId === currentPhaseId ? "Current step" : "Inspecting"}</span>
        <h3>{inspectorTitle}</h3>
        <span className={`inspector-status ${inspectorStatus === "In progress" ? "active" : ""}`}>
          {inspectorComplete ? <CheckCircle weight="fill" /> : <Clock />}{inspectorStatus}
        </span>
        <dl className="inspector-summary">
          <div><dt>Phase</dt><dd>{inspectedPhase?.label ?? "—"}</dd></div>
          <div><dt>Workflow step</dt><dd>{currentPhase?.label ?? "—"}</dd></div>
          <div><dt>Phase visits</dt><dd>{inspectedPhase?.visits.length ?? 0}</dd></div>
        </dl>
        {inspectedPhase?.id === "planning" && <>
          <details open><summary>Self review</summary><p>{selfReviewVisits.length > 1 ? "The plan was repaired and passed its bounded recheck." : "All checks passed."}</p></details>
          <details open><summary>Independent review</summary><p>{independentVisits.length > 1 ? "The response and final trace were checked before human review." : "Ready for human review."}</p></details>
        </>}
        {inspectedPhase?.id === "approval" && <>
          <details open><summary>Planning decisions</summary>{planningGates.map((gate) => <p key={gate.visitSequence}><strong>Round {gate.round}:</strong> {gateOutcomeLabel(gate.decision)}</p>)}</details>
          <details open><summary>Design decisions</summary>{designGates.map((gate) => <p key={gate.visitSequence}><strong>Round {gate.round}:</strong> {gateOutcomeLabel(gate.decision)}</p>)}</details>
          {approvalLinks.length > 0 && <details open><summary>Review links</summary>{approvalLinks.map((link) => <p key={link.url} className={selectedApprovalLinks.has(link.url) ? "selected-evidence" : ""}><a href={link.url} target="_blank" rel="noreferrer"><GitPullRequest /> {link.label}</a>{link.kind === "pull_request" && <a href={bettaViewUrl(link.url)} target="_blank" rel="noreferrer"><Eye /> Open in BettaView</a>}</p>)}</details>}
        </>}
        {inspectedPhase?.id === "design" && <details open><summary>Review rounds</summary>{designGates.map((gate) => <p key={gate.visitSequence}><strong>Round {gate.round}:</strong> {gateOutcomeLabel(gate.decision)}</p>)}</details>}
        {inspectorProduct && <details open><summary>Artifacts</summary><p><PullRequestActions url={inspectorProduct.url} githubLabel={`PR #${inspectorProduct.number}`} /></p><p>{inspectorProduct === planningProduct ? "Proposal and complete specs" : "design.md"}</p></details>}
        {inspectorAttempts.length > 0 && <details><summary>Transcript</summary>{inspectorAttempts.map((attempt) => <button className="inspector-action" type="button" key={attempt.id} onClick={() => onOpenTranscript(attempt.id)}>View transcript</button>)}</details>}
      </aside>
    </div>
    <div className="phase-history">
      <button type="button" aria-expanded={historyOpen} onClick={() => setHistoryOpen((open) => !open)}><Clock /><span><strong>Visit history</strong> · {projection.history.length} events</span>{historyOpen ? <CaretDown /> : <CaretRight />}</button>
      {historyOpen && <ol>{[...projection.history].reverse().map((visit) => <li key={visit.sequence}><button type="button" className={selectedVisit === visit.sequence ? "selected" : ""} onClick={() => inspectVisit(visit)}><span>{visit.sequence}</span><strong>{human(visit.label)}</strong><small>{formatTime(visit.enteredAt)}</small></button></li>)}</ol>}
    </div>
  </section>;
}

function SettingsPanel() {
  const [overview, setOverview] = useState<RouteAdminOverview | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [repositoryKey, setRepositoryKey] = useState("");
  const [dispatchEnabled, setDispatchEnabled] = useState(false);
  const [independentModel, setIndependentModel] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(true);

  const repositories = useMemo(() => overview?.github.values.flatMap((installation) =>
    installation.repositories.map((repository) => ({
      ...repository,
      key: `${installation.installationId}|${repository.fullName}`,
    }))) ?? [], [overview]);
  const selected = overview?.routes.find((route) => route.projectId === selectedId) ?? null;

  const syncDraft = useCallback((route: RepositoryRoute) => {
    setRepositoryKey(`${route.githubInstallationId}|${route.repository}`);
    setDispatchEnabled(route.dispatchEnabled);
    setIndependentModel(route.independentReviewModel ?? "");
  }, []);

  const load = useCallback(async () => {
    setBusy(true);
    setMessage("");
    try {
      const value = await api<RouteAdminOverview>("/api/settings/routes");
      setOverview(value);
      const route = value.routes.find((item) => item.projectId === selectedId) ?? value.routes[0] ?? null;
      setSelectedId(route?.projectId ?? null);
      if (route !== null) syncDraft(route);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Settings could not be loaded.");
    } finally { setBusy(false); }
  }, [selectedId, syncDraft]);

  useEffect(() => { void load(); }, [load]);

  const replaceRoute = (route: RepositoryRoute) => {
    setOverview((value) => value === null ? value : {
      ...value,
      routes: value.routes.some((item) => item.projectId === route.projectId)
        ? value.routes.map((item) => item.projectId === route.projectId ? route : item)
        : [...value.routes, route].sort((left, right) => left.projectName.localeCompare(right.projectName)),
    });
    setSelectedId(route.projectId);
    syncDraft(route);
  };

  const work = async (action: () => Promise<RepositoryRoute>, success: string) => {
    setBusy(true);
    setMessage("");
    try {
      replaceRoute(await action());
      setAdding(false);
      setMessage(success);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The route could not be saved.");
    } finally { setBusy(false); }
  };

  const parsedRepository = () => {
    const separator = repositoryKey.indexOf("|");
    return separator < 1 ? null : {
      githubInstallationId: repositoryKey.slice(0, separator),
      repository: repositoryKey.slice(separator + 1),
    };
  };

  const openRoute = (route: RepositoryRoute) => {
    setAdding(false);
    setSelectedId(route.projectId);
    syncDraft(route);
    setMessage("");
  };

  return <section className="settings-page">
    <div className="settings-heading"><div><span className="eyebrow">Project connections</span><h1>Repository routes</h1><p>Pair each Linear project with one repository the DEOS GitHub App can use.</p></div><button className="add-route" type="button" onClick={() => {
      setAdding(true);
      setProjectId(overview?.linear.values.find((project) =>
        !overview.routes.some((route) => route.projectId === project.projectId))?.projectId ?? "");
      setRepositoryKey(repositories.find((repository) => repository.access === "ready")?.key ?? "");
      setMessage("");
    }} disabled={busy || overview?.linear.state !== "ready" || overview?.github.state !== "ready"}>Add route</button></div>

    {(overview?.linear.state === "unavailable" || overview?.github.state === "unavailable") &&
      <div className="provider-warning" role="status"><WarningCircle /> A live provider list is unavailable. Saved routes remain visible, but unchecked routes cannot be enabled.</div>}

    <div className="route-card-grid" aria-label="Configured repository routes">
      {overview?.routes.map((route) => <button type="button" key={route.projectId}
        className={`route-card ${route.projectId === selectedId && !adding ? "selected" : ""}`}
        onClick={() => openRoute(route)}>
        <span className="route-card-top"><span className="eyebrow">{route.projectName}</span><span className={route.dispatchEnabled ? "guard" : "guard active"}>{route.dispatchEnabled ? "Enabled" : "Off"}</span></span>
        <strong>{route.projectName}</strong>
        <span className="route-pair"><span>Linear</span><ArrowRight /><span>{route.repository}</span></span>
        <span className="route-card-meta"><span className={`access-dot ${route.accessState}`} />{human(route.accessState)} · {route.activeRuns} active</span>
      </button>)}
      {overview?.routes.length === 0 && <div className="settings-card"><h2>No routes yet</h2><p>Add a Linear project and GitHub repository connection.</p></div>}
    </div>

    {adding && <div className="settings-card route-editor">
      <div className="card-heading"><div><span className="eyebrow">New connection</span><h2>Add repository route</h2><p>The route starts off. Enable it after checking the saved pairing.</p></div><GithubLogo /></div>
      <div className="field-grid"><div><label htmlFor="new-project">Linear project</label><select id="new-project" value={projectId} onChange={(event) => setProjectId(event.target.value)} disabled={busy}>
        {overview?.linear.values.filter((project) => !overview.routes.some((route) => route.projectId === project.projectId)).map((project) => <option value={project.projectId} key={project.projectId}>{project.name} · {project.teams.map((team) => team.key).join(", ")}</option>)}
      </select></div><div><label htmlFor="new-repository">GitHub App repository</label><select id="new-repository" value={repositoryKey} onChange={(event) => setRepositoryKey(event.target.value)} disabled={busy}>
        {repositories.map((repository) => <option value={repository.key} key={repository.key} disabled={repository.access !== "ready"}>{repository.fullName} · {repository.accountLogin}</option>)}
      </select></div></div>
      <div className="settings-actions"><button type="button" disabled={busy || !projectId || parsedRepository() === null} onClick={() => {
        const repository = parsedRepository();
        if (repository !== null) void work(() => routeMutation<RepositoryRoute>("/api/settings/routes", "POST", { projectId, ...repository }), "Route created, checked, and read back from D1.");
      }}>Create route</button><button className="secondary" type="button" onClick={() => setAdding(false)} disabled={busy}>Cancel</button></div>
    </div>}

    {!adding && selected !== null && <div className="settings-grid route-editor-grid">
      <div className="settings-stack">
        <div className="settings-card">
          <div className="card-heading"><div><span className="eyebrow">{selected.projectName}</span><h2>GitHub repository</h2><p>Changing this turns off only this route. Active work keeps its saved repository.</p></div><span className={`guard ${selected.accessState === "passed" ? "" : "active"}`}>{human(selected.accessState)}</span></div>
          <label htmlFor="repository">Repository</label><select id="repository" value={repositoryKey} onChange={(event) => setRepositoryKey(event.target.value)} disabled={busy || overview?.github.state !== "ready"}>
            {!repositories.some((repository) => repository.key === repositoryKey) && <option value={repositoryKey}>{selected.repository} · saved route</option>}
            {repositories.map((repository) => <option value={repository.key} key={repository.key} disabled={repository.access !== "ready"}>{repository.fullName} · {repository.accountLogin}</option>)}
          </select>
          <div className="settings-actions"><button type="button" disabled={busy || parsedRepository() === null || repositoryKey === `${selected.githubInstallationId}|${selected.repository}`} onClick={() => {
            const repository = parsedRepository();
            if (repository !== null) void work(() => routeMutation<RepositoryRoute>(`/api/settings/routes/${selected.projectId}/repository`, "PUT", { ...repository, expectedRevision: selected.repositoryRevision }), "Repository saved for future runs.");
          }}>Save repository</button><button className="secondary" type="button" disabled={busy} onClick={() => void work(() => routeMutation<RepositoryRoute>(`/api/settings/routes/${selected.projectId}/recheck`, "POST", {}), "GitHub App access checked and read back.")}>Recheck</button></div>
        </div>
        <div className="settings-card controls-card">
          <div className="card-heading"><div><h2>Workflow controls</h2><p>This setting applies to new {selected.startStateName} events.</p></div><span className="guard">Future runs</span></div>
          <label className="switch-row">
            <span><strong>Workflow dispatch</strong><small>Let accepted {selected.startStateName} events start a workflow.</small></span>
            <input type="checkbox" checked={dispatchEnabled} onChange={(event) => setDispatchEnabled(event.target.checked)} disabled={busy || (!dispatchEnabled && (selected.accessState !== "passed" || overview?.github.state !== "ready"))} />
          </label>
          {!selected.dispatchEnabled && (selected.accessState !== "passed" || overview?.github.state !== "ready") &&
            <p className="guard-note">Recheck live GitHub App access before enabling this route.</p>}
          {selected.activeRuns > 0 && <p className="guard-note">{selected.activeRuns} active run(s) keep their frozen setup. This save affects only later work.</p>}
          <div className="settings-actions"><button type="button" onClick={() => void work(() => routeMutation<RepositoryRoute>(`/api/settings/routes/${selected.projectId}/workflow`, "PUT", { dispatchEnabled, expectedRevision: selected.workflowRevision }), "Workflow control saved for future runs.")} disabled={busy || dispatchEnabled === selected.dispatchEnabled || (dispatchEnabled && (selected.accessState !== "passed" || overview?.github.state !== "ready"))}>Save workflow controls</button><button className="secondary" type="button" onClick={() => void load()} disabled={busy}>Reload</button></div>
          {message && <div className="settings-message" role="status">{message}</div>}
        </div>
        <div className="settings-card">
          <div className="card-heading"><div><h2>Independent review</h2><p>This model is frozen into each new traceability run.</p></div><span className="guard">Future runs</span></div>
          <label htmlFor="independent-review-model">Review model</label>
          <select id="independent-review-model" value={independentModel} onChange={(event) => setIndependentModel(event.target.value)} disabled={busy}>
            {overview?.supportedReviewModels.map((model) => <option value={model} key={model}>{model}</option>)}
          </select>
          <p>The provider key stays in the trusted Worker. Active runs keep their saved model.</p>
          <div className="settings-actions"><button type="button" onClick={() => void work(() => routeMutation<RepositoryRoute>(`/api/settings/routes/${selected.projectId}/review`, "PUT", { model: independentModel, expectedRevision: selected.independentReviewRevision }), "Review model saved for future runs.")} disabled={busy || independentModel.length === 0 || independentModel === selected.independentReviewModel}>Save review model</button></div>
        </div>
      </div>
      <div className="connection-card">
        <h2>Route status</h2>
        <dl>
          <div><dt>Active runs</dt><dd>{selected.activeRuns}</dd></div>
          <div><dt>Route revision</dt><dd>{selected.routeRevision}</dd></div>
          <div><dt>Saved</dt><dd>{formatTime(selected.updatedAt)}</dd></div>
          <div><dt>Saved by</dt><dd>{selected.updatedBy}</dd></div>
          <div><dt>Access checked</dt><dd>{formatTime(selected.accessCheckedAt)}</dd></div>
          <div><dt>Workflow</dt><dd>{selected.definitionId} v{selected.definitionVersion}</dd></div>
        </dl>
        <a href={selected.githubSettingsUrl ?? "https://github.com/settings/installations"} target="_blank" rel="noreferrer">Manage this GitHub App install <ArrowSquareOut /></a>
        <p>GitHub grants repository access. DEOS only checks it and records a safe result.</p>
      </div>
    </div>}
    {message && (adding || selected === null) && <div className="settings-message" role="status">{message}</div>}
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

interface DesignReviewProjection {
  run: Record<string, unknown>;
  supported: boolean;
  rounds: Array<Record<string, unknown> & { round_no: number; selfStatus: string }>;
  attempts: Array<{
    id: string;
    round: number;
    phase: string;
    inputSha256: string;
    candidateId: string;
    reviewedHeadSha: string | null;
    reviewer: { provider: string; model: string; reasoning: string };
    outcome: string;
    accepted: boolean;
    freshness: "current" | "stale" | "historical" | "private";
    completedAt: string | null;
    findings: Array<{
      id: string;
      severity: string;
      category: string;
      message: string;
      sourceRanges: Array<{ path: string; startLine: number; endLine: number }>;
      disposition: null | { disposition: string; reason: string };
    }>;
    artifacts: ReviewArtifact[];
  }>;
  gateBindings: Array<Record<string, unknown>>;
}

function DesignReviewPage({ runId }: { runId: string }) {
  const [proof, setProof] = useState<DesignReviewProjection | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void api<DesignReviewProjection>(`/api/runs/${encodeURIComponent(runId)}/design-review`, controller.signal)
      .then(setProof)
      .catch((cause) => {
        if (!(cause instanceof DOMException && cause.name === "AbortError")) {
          setError(cause instanceof Error ? cause.message : "The design review proof could not be loaded.");
        }
      });
    return () => controller.abort();
  }, [runId]);
  if (error) return <section className="empty-state"><WarningCircle /><h1>Design review unavailable</h1><p>{error}</p></section>;
  if (proof === null) return <section className="empty-state"><SpinnerGap className="spin" /><h1>Loading design review</h1></section>;
  const issueKey = typeof proof.run.issue_key === "string" ? proof.run.issue_key : "Linear issue";
  const issueTitle = typeof proof.run.title === "string" ? proof.run.title : "";
  const issueUrl = typeof proof.run.linear_url === "string" ? proof.run.linear_url : null;
  const pullRequestUrl = typeof proof.run.pull_request_url === "string" ? proof.run.pull_request_url : null;
  if (!proof.supported) return <section className="empty-state"><WarningCircle /><h1>Design review not required</h1><p>This run uses a workflow definition from before semantic design review was introduced.</p></section>;
  return <section className="review-page">
    <div className="settings-heading"><div><span className="eyebrow">Protected workflow proof</span><h1>OpenSpec design review</h1><p>Accepted D1 state and hash-verified R2 evidence for the exact reviewed design head.</p></div><GitPullRequest /></div>
    <article className="settings-card">
      <div className="card-heading"><div><span className="eyebrow">Reviewed work</span><h2>{issueKey}: {issueTitle}</h2></div><span className="guard">{String(proof.run.status ?? "unknown")}</span></div>
      <dl><div><dt>Run</dt><dd><code>{runId}</code></dd></div><div><dt>Current design head</dt><dd><code>{typeof proof.run.head_sha === "string" ? proof.run.head_sha.slice(0, 12) : "Not published"}</code></dd></div><div><dt>Review rounds</dt><dd>{proof.rounds.length}</dd></div><div><dt>Gate bindings</dt><dd>{proof.gateBindings.length}</dd></div></dl>
      <div className="review-artifacts">{issueUrl && <a href={issueUrl} target="_blank" rel="noreferrer">Open Linear issue <ArrowSquareOut /></a>}{pullRequestUrl && <a href={pullRequestUrl} target="_blank" rel="noreferrer">Open design PR <ArrowSquareOut /></a>}</div>
    </article>
    <div className="review-summary-grid">{proof.rounds.map((round) => <article className="review-phase" key={String(round.round_id)}><span className="eyebrow">Round {round.round_no} · {human(String(round.kind))}</span><h2>{human(String(round.status))}</h2><dl><div><dt>Self-check</dt><dd>{human(round.selfStatus)}</dd></div><div><dt>Author responses</dt><dd>{String(round.response_turns)}</dd></div><div><dt>Outside model</dt><dd>{String(round.outside_model)}</dd></div></dl></article>)}</div>
    <ol className="review-timeline">{proof.attempts.map((attempt, index) => <li key={attempt.id} className={`review-event ${attempt.outcome}`}>
      <div className="review-event-index">{index + 1}</div><div className="review-event-body">
        <div className="card-heading"><div><span className="eyebrow">Round {attempt.round} · {human(attempt.phase)}</span><h2>{human(attempt.outcome)}</h2></div><span className="guard">{human(attempt.freshness)}</span></div>
        <p>Reviewer {attempt.reviewer.provider} · {attempt.reviewer.model} · {attempt.reviewer.reasoning}. This evidence is not human approval.</p>
        <dl><div><dt>Input</dt><dd><code>{attempt.inputSha256.slice(0, 16)}…</code></dd></div><div><dt>Candidate</dt><dd><code>{attempt.candidateId.slice(0, 20)}…</code></dd></div><div><dt>Head</dt><dd><code>{attempt.reviewedHeadSha?.slice(0, 12) ?? "private candidate"}</code></dd></div><div><dt>Finished</dt><dd>{attempt.completedAt ? formatTime(attempt.completedAt) : "Failed or running"}</dd></div></dl>
        {attempt.findings.length > 0 && <div className="review-findings"><h3>Design concerns</h3>{attempt.findings.map((finding) => <article key={finding.id}><strong>{finding.id}</strong><span>{finding.disposition ? human(finding.disposition.disposition) : human(finding.severity)}</span><p>{finding.message}</p>{finding.disposition && <p><strong>Author:</strong> {finding.disposition.reason}</p>}<div className="review-artifacts">{finding.sourceRanges.map((range, rangeIndex) => <code key={rangeIndex}>{range.path}:{range.startLine}-{range.endLine}</code>)}</div></article>)}</div>}
        <div className="review-artifacts">{attempt.artifacts.map((artifact) => <a href={artifact.url} key={artifact.name} target="_blank" rel="noreferrer">{artifact.name} <ArrowSquareOut /></a>)}</div>
      </div>
    </li>)}</ol>
  </section>;
}

function App() {
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem("deos-theme") as Theme | null) ?? "system");
  const [query, setQuery] = useState(() => localStorage.getItem("deos-issue") ?? "SAC-148");
  const [issues, setIssues] = useState<Issue[]>([]);
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [runId, setRunId] = useState("");
  const [poll, setPoll] = useState<PollState<Projection>>({ applied: null, staged: null, error: null });
  const [selectedVisit, setSelectedVisit] = useState<number | null>(null);
  const [transcriptAttempt, setTranscriptAttempt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [retryMessage, setRetryMessage] = useState<string | null>(null);
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

  const navigate = useCallback((next: "workflow" | "settings") => {
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
      setRetryMessage(null);
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
  const groupedWorkflow = projection !== null && isDesignStageWorkflow(projection.run.definitionVersion, projection.stages);

  const continueRun = useCallback(async () => {
    if (projection?.retry === null || projection === null || !runId) return;
    const step = human(projection.retry.retryNode);
    if (!window.confirm(`Retry this run from ${step}? Completed work will be kept.`)) return;
    setRetrying(true);
    setRetryMessage(null);
    try {
      await retryMutation(`/api/runs/${encodeURIComponent(runId)}/retry`, projection.retry);
      setRetryMessage(`Retry started from ${step}. Completed work was kept.`);
      await loadProjection(runId, true);
    } catch (error) {
      setRetryMessage(error instanceof Error ? error.message : "The workflow could not be continued.");
    } finally {
      setRetrying(false);
    }
  }, [loadProjection, projection, runId]);

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
      {page === "settings" ? <SettingsPanel /> : page === "review" ? <ReviewTracePage runId={reviewRunIdFromPath(window.location.pathname) ?? ""} /> : page === "design-review" ? <DesignReviewPage runId={reviewRunIdFromPath(window.location.pathname) ?? ""} /> : page === "not-found" ? <section className="empty-state"><WarningCircle /><h1>Page not found</h1><p>This portal route is not registered.</p><button className="route-action" type="button" onClick={() => navigate("workflow")}>Go to workflows</button></section> : <>
      {poll.staged && <div className="update-banner"><span><ArrowClockwise /> Confirmed workflow data is ready.</span><button type="button" onClick={() => setPoll(applyStaged)}>Apply update</button></div>}
      {poll.error && <div className="error-banner"><WarningCircle />{poll.error}<button type="button" onClick={() => runId && void loadProjection(runId)}>Retry</button></div>}
      {retryMessage && <div className="retry-message" aria-live="polite"><ArrowClockwise />{retryMessage}</div>}
      {selectedIssue && <section className="issue-header">
        <div><span className="eyebrow">{selectedIssue.key}</span><h1>{selectedIssue.title}</h1><a href={selectedIssue.url} target="_blank" rel="noreferrer">Open issue <ArrowSquareOut /></a></div>
        <div className="run-control"><label htmlFor="run">Workflow run</label><select id="run" value={runId} onChange={(event) => { setRunId(event.target.value); setSelectedVisit(null); setTranscriptAttempt(null); setRetryMessage(null); void loadProjection(event.target.value, true); }}>{runs.map((run) => <option value={run.id} key={run.id}>Run {run.sequence} · {human(run.status)}</option>)}</select></div>
      </section>}
      {projection ? <>
        <section className="status-strip"><div><span className={`status-pill ${projection.run.status}`}>{human(projection.run.status)}</span><span>Definition v{projection.run.definitionVersion}</span></div><div className="run-status-actions"><span>Fresh as of {formatTime(projection.run.freshness)}</span>{projection.retry && <button type="button" className="retry-run" disabled={retrying} onClick={() => void continueRun()}>{retrying ? <SpinnerGap className="spin" /> : <ArrowClockwise />}{retrying ? "Starting…" : "Retry failed step"}</button>}</div></section>
        {groupedWorkflow ? <TraceabilityWorkflowMap
          projection={projection}
          selectedVisit={selectedVisit}
          onSelectVisit={setSelectedVisit}
          onOpenTranscript={setTranscriptAttempt}
        /> : <><section className="workflow-panel" aria-labelledby="workflow-title">
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
              {detail.gate && <div className="gate-visit-card">
                <span className="eyebrow">{human(detail.gate.gate_kind)} gate · round {detail.gate.round}</span>
                <dl><div><dt>Work</dt><dd>{human(detail.gate.work_type)}</dd></div><div><dt>Decision</dt><dd>{human(detail.gate.decision_outcome ?? detail.gate.state)}</dd></div><div><dt>Approved head</dt><dd><code>{detail.gate.approved_head_sha.slice(0, 12)}</code></dd></div></dl>
                <div className="planning-pr-actions"><a className="review-trace-link" href={detail.gate.pull_request_url} target="_blank" rel="noreferrer">Open PR #{detail.gate.pull_request_number} <ArrowSquareOut /></a><a className="review-trace-link" href={bettaViewUrl(detail.gate.pull_request_url)} target="_blank" rel="noreferrer">Open in BettaView <ArrowSquareOut /></a></div>
              </div>}
              {(["planning", "plan_merge"].includes(detail.stageId) && projection.workProducts.planning) && <div className="planning-pr-actions">
                <a className="review-trace-link" href={projection.workProducts.planning.url} target="_blank" rel="noreferrer">Open planning PR <ArrowSquareOut /></a>
                <a className="review-trace-link" href={bettaViewUrl(projection.workProducts.planning.url)} target="_blank" rel="noreferrer">Open in BettaView <ArrowSquareOut /></a>
              </div>}
              {(["design", "design_merge"].includes(detail.stageId) && projection.workProducts.design) && <div className="planning-pr-actions">
                <a className="review-trace-link" href={projection.workProducts.design.url} target="_blank" rel="noreferrer">Open design PR <ArrowSquareOut /></a>
                <a className="review-trace-link" href={bettaViewUrl(projection.workProducts.design.url)} target="_blank" rel="noreferrer">Open in BettaView <ArrowSquareOut /></a>
              </div>}
            </div>}
          </section>
          <section className="history-panel">
            <div className="section-heading"><div><span className="eyebrow">Chronology</span><h2>Visit history</h2></div><span>{projection.history.length} visits</span></div>
            <ol className="history-list">{[...projection.history].reverse().map((visit) => <li key={visit.sequence}><button type="button" className={detail?.sequence === visit.sequence ? "selected" : ""} onClick={() => setSelectedVisit(visit.sequence)}><span className="history-number">{visit.sequence}</span><span><strong>{visit.label}</strong><small>{formatTime(visit.enteredAt)}{visit.cycle > 1 ? ` · cycle ${visit.cycle}` : ""}</small></span><span className="history-state">{human(visit.state)}</span></button></li>)}</ol>
          </section>
        </div></>}
      </> : <section className="empty-state">{busy ? <><SpinnerGap className="spin" /><h1>Loading durable workflow state</h1></> : <><MagnifyingGlass /><h1>Find a DEOS workflow</h1><p>Search for a Linear issue key to inspect its workflow runs and durable business state.</p></>}</section>}</>}
    </main>
    {transcriptAttempt !== null && <TranscriptViewer attemptId={transcriptAttempt} loadTranscript={loadTranscript} onClose={() => setTranscriptAttempt(null)} />}
  </div>;
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
