const stageIds = ["claim", "planning", "review", "merge", "complete", "stopped"];

const stageLabels = Object.freeze({
  claim: "Claim issue",
  planning: "Create planning PR",
  review: "Human approval",
  merge: "Automatic merge & check",
  complete: "Completed",
  stopped: "Stopped",
});

const terminalStatuses = new Set(["succeeded", "failed", "blocked", "canceled", "denied"]);

const formatStarted = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unavailable";
  return `${new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date)} · ${date.toISOString().slice(11, 19)} UTC`;
};

const formatDuration = (milliseconds) => {
  const seconds = Math.max(0, Math.round(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  if (hours > 0) return `${hours} hr ${minutes} min ${remainder} sec`;
  if (minutes > 0) return `${minutes} min ${remainder} sec`;
  return `${remainder} sec`;
};

const elapsed = (startedAt, endedAt) => {
  const started = Date.parse(startedAt);
  const ended = Date.parse(endedAt);
  return Number.isFinite(started) && Number.isFinite(ended) && ended >= started ? ended - started : 0;
};

const latestUniqueLinks = (history, kind) => {
  const links = new Map();
  for (const visit of history) {
    for (const link of visit.links ?? []) {
      if (link.kind === kind) links.set(link.label, { label: link.label, url: link.url });
    }
  }
  return [...links.values()].sort((left, right) => left.label.localeCompare(right.label));
};

const stateFromStatus = (status) => {
  if (status === "succeeded") return "finished";
  if (["failed", "blocked", "denied"].includes(status)) return "failed";
  if (status === "canceled") return "stopped";
  if (["pending_dispatch", "awaiting_human", "awaiting_capability", "manual_reconciliation_required"].includes(status)) return "waiting";
  if (status === "active") return "active";
  return "unknown";
};

const stateLabelFromStatus = (status) => ({
  succeeded: "Finished",
  failed: "Failed",
  blocked: "Blocked",
  denied: "Denied",
  canceled: "Stopped",
  awaiting_human: "Waiting",
  awaiting_capability: "Waiting",
  manual_reconciliation_required: "Waiting",
  active: "In progress",
  pending_dispatch: "Starting",
}[status] ?? "Unknown");

const statusForCurrentStage = (runStatus) => {
  if (["pending_dispatch", "awaiting_human", "awaiting_capability", "manual_reconciliation_required"].includes(runStatus)) return "waiting";
  if (runStatus === "active") return "active";
  return "unknown";
};

const transcriptForAttempt = (attempt, ordinal) => ({
  label: `Planning Agent · Run ${ordinal}`,
  outcome: attempt.outcome ?? attempt.state,
  summary: "",
  facts: [
    { label: "Started", value: formatStarted(attempt.startedAt) },
    { label: "Duration", value: formatDuration(elapsed(attempt.startedAt, attempt.endedAt ?? attempt.startedAt)) },
  ],
  notes: [],
  source: {
    label: "Open full transcript",
    format: "JSONL",
    byteSize: attempt.transcriptByteSize ?? 0,
    sha256: attempt.transcriptSha256 ?? "",
    attemptId: attempt.id,
  },
});

export const simpleIssueFromProjection = (projection) => {
  if (projection?.run?.definitionName !== "simple" || !projection.issue || !Array.isArray(projection.history)) {
    throw new Error("This run is not a supported simple workflow projection.");
  }
  const { issue, run, history } = projection;
  const state = stateFromStatus(run.status);
  const currentVisit = history.find((visit) => visit.sequence === run.currentVisitSequence) ?? history.at(-1);
  const currentStage = currentVisit?.stageId ?? "stopped";
  const visitedStages = new Set(history.map((visit) => visit.stageId));
  const stageStates = Object.fromEntries(stageIds.map((id) => [id, "future"]));
  for (const id of visitedStages) stageStates[id] = "completed";

  if (terminalStatuses.has(run.status)) {
    if (run.status !== "succeeded") {
      stageStates.stopped = state === "stopped" ? "stopped" : "failed";
      for (const id of stageIds) {
        if (id !== "stopped" && !visitedStages.has(id)) stageStates[id] = "skipped";
      }
    } else {
      stageStates.stopped = "future";
    }
  } else {
    stageStates[currentStage] = statusForCurrentStage(run.status);
  }

  const stageDetails = {};
  for (const stageId of stageIds) {
    const visits = history.filter((visit) => visit.stageId === stageId);
    if (visits.length === 0) continue;
    const startedAt = visits[0].enteredAt;
    const duration = visits.reduce((total, visit) =>
      total + elapsed(visit.enteredAt, visit.leftAt ?? run.updatedAt), 0);
    stageDetails[stageId] = {
      facts: [
        { label: "Started", value: formatStarted(startedAt) },
        { label: "Duration", value: formatDuration(duration) },
      ],
    };
  }
  const artifacts = latestUniqueLinks(history, "openspec_artifact");
  if (artifacts.length > 0) stageDetails.planning = { ...stageDetails.planning, files: artifacts };

  const attempts = history
    .filter((visit) => visit.stageId === "planning")
    .flatMap((visit) => visit.attempts ?? [])
    .filter((attempt) => attempt.transcriptAvailable);
  const agentRuns = attempts.map((attempt, index) => transcriptForAttempt(attempt, index + 1));
  const planningVisits = history.filter((visit) => visit.stageId === "planning").length;
  const stoppedIndex = history.findIndex((visit) => visit.stageId === "stopped");
  const observedBranchSource = stoppedIndex > 0 ? history[stoppedIndex - 1].stageId : undefined;

  const recordedPrLinks = latestUniqueLinks(history, "pull_request");
  const pullRequest = projection.pullRequest ?? (recordedPrLinks[0]
    ? {
        number: Number(recordedPrLinks[0].label.replace(/^PR #/, "")),
        url: recordedPrLinks[0].url,
        status: "Confirmed",
        verified: false,
      }
    : null);
  const pullRequestView = pullRequest === null ? null : {
    label: `PR #${pullRequest.number}`,
    title: `${issue.key}: OpenSpec plan`,
    status: pullRequest.status,
    url: pullRequest.url,
  };
  const headline = pullRequestView && run.status === "succeeded"
    ? `Planning ${pullRequestView.label} merged${pullRequest.verified ? " and verified" : ""}`
    : run.status === "awaiting_human"
      ? "Waiting for human approval"
      : stageLabels[currentStage] ?? "Last confirmed workflow state";

  return Object.freeze({
    key: issue.key,
    title: issue.title,
    listText: `Run ${run.sequence} · ${stateLabelFromStatus(run.status).toLowerCase()}`,
    state,
    stateLabel: stateLabelFromStatus(run.status),
    headline,
    currentStep: run.currentNode,
    stageStates,
    stageDetails,
    pullRequest: pullRequestView,
    linear: { label: issue.key, title: issue.title, url: issue.url },
    agentRuns: { planning: agentRuns },
    cycles: { planning: planningVisits },
    runs: { planning: attempts.length },
    observedBranchSource,
    primaryAction: "View planning result",
    evidence: {
      runId: run.id,
      definitionVersion: run.definitionVersion,
      definitionDigest: run.definitionDigest,
      freshness: run.freshness,
    },
  });
};

export const loadSimpleWorkflowIssues = async (signal) => {
  const listResponse = await fetch("/api/workflows/simple/issues", { signal, headers: { Accept: "application/json" } });
  if (!listResponse.ok) throw new Error("The recorded simple workflows are unavailable right now.");
  const list = await listResponse.json();
  if (!Array.isArray(list.issues)) throw new Error("The recorded simple workflow list is invalid.");
  const projections = await Promise.all(list.issues.map(async (summary) => {
    const response = await fetch(`/api/runs/${encodeURIComponent(summary.runId)}`, {
      signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`The recorded workflow for ${summary.key} is unavailable right now.`);
    return simpleIssueFromProjection(await response.json());
  }));
  return Object.freeze(Object.fromEntries(projections.map((issue) => [issue.key, issue])));
};
