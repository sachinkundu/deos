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

const human = (value) => value.replaceAll("_", " ").replaceAll("-", " ");

const titleCase = (value) => {
  const words = human(value);
  return words.length === 0 ? "Workflow" : `${words[0].toUpperCase()}${words.slice(1)}`;
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

const transcriptForAttempt = (attempt, ordinal, stageLabel) => ({
  label: `${stageLabel} agent · Run ${ordinal}`,
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

const stageKind = (stageId) => {
  if (["review", "requirements", "architecture", "release"].includes(stageId)) return "gate";
  if (["stopped", "terminal"].includes(stageId)) return "failure";
  if (["planning", "specification", "implementation_plan"].includes(stageId)) return "artifact";
  return "action";
};

const stageIcon = (stageId) => ({
  claim: "claim",
  planning: "planning",
  review: "review",
  merge: "merge",
  complete: "complete",
  completed: "complete",
  stopped: "stopped",
  terminal: "stopped",
}[stageId] ?? "default");

const stageLayout = (index) => {
  const columns = 4;
  const row = Math.floor(index / columns);
  const offset = index % columns;
  const column = row % 2 === 0 ? offset : columns - offset - 1;
  return { x: 70 + column * 245, y: 45 + row * 165, row, column };
};

const workflowPresentation = (projection) => {
  const layouts = new Map();
  const indexes = new Map();
  const stages = projection.stages.map((stage, index) => {
    const position = stageLayout(index);
    layouts.set(stage.id, position);
    indexes.set(stage.id, index);
    return {
      id: stage.id,
      label: stage.label,
      phase: "Workflow stage",
      actor: "DEOS workflow",
      kind: stageKind(stage.id),
      stageIndex: index,
      x: position.x,
      y: position.y,
      icon: stageIcon(stage.id),
      summary: `Recorded ${stage.label.toLowerCase()} stage from the frozen workflow definition.`,
      result: `${stage.label} complete`,
      files: [],
      agents: [],
      cycleBased: false,
    };
  });
  const seen = new Set();
  const connections = [];
  for (const connection of projection.connections ?? []) {
    if (!connection?.from || !connection?.to || connection.from === connection.to) continue;
    const identity = `${connection.from}->${connection.to}`;
    if (seen.has(identity) || !layouts.has(connection.from) || !layouts.has(connection.to)) continue;
    seen.add(identity);
    const source = layouts.get(connection.from);
    const target = layouts.get(connection.to);
    const branch = ["stopped", "terminal"].includes(connection.to);
    const returns = !branch && indexes.get(connection.to) <= indexes.get(connection.from);
    const movesRight = source.column < target.column;
    connections.push({
      source: connection.from,
      target: connection.to,
      sourceHandle: branch ? "bottom" : returns ? "top-out" : source.row === target.row ? movesRight ? "right-out" : "left-out" : "bottom",
      targetHandle: branch ? "bottom-in" : returns ? "top" : source.row === target.row ? movesRight ? "left" : "right" : "top",
      kind: branch ? "branch" : returns ? "return" : "forward",
      label: returns ? titleCase(connection.outcome) : undefined,
    });
  }
  const rows = Math.max(1, Math.ceil(stages.length / 4));
  return {
    id: projection.run.definitionName,
    label: `${titleCase(projection.run.definitionName)} workflow`,
    stages,
    connections,
    height: Math.max(470, rows * 165 + 150),
  };
};

export const workflowIssueFromProjection = (projection) => {
  if (!projection?.run?.definitionName || !projection.issue || !Array.isArray(projection.history) || !Array.isArray(projection.stages)) {
    throw new Error("This run is not a valid workflow projection.");
  }
  const { issue, run, history } = projection;
  const workflow = workflowPresentation(projection);
  const stageIds = workflow.stages.map((stage) => stage.id);
  const stageLabels = Object.fromEntries(workflow.stages.map((stage) => [stage.id, stage.label]));
  const state = stateFromStatus(run.status);
  const currentVisit = history.find((visit) => visit.sequence === run.currentVisitSequence) ?? history.at(-1);
  const currentStage = currentVisit?.stageId ?? stageIds.at(-1);
  const visibleHistory = history.filter((visit) => visit.recovered !== true);
  const visitedStages = new Set(visibleHistory.map((visit) => visit.stageId));
  const stageStates = Object.fromEntries(stageIds.map((id) => [id, "future"]));
  for (const id of visitedStages) {
    if (id in stageStates) stageStates[id] = "completed";
  }

  if (terminalStatuses.has(run.status)) {
    if (run.status !== "succeeded" && currentStage in stageStates) {
      stageStates[currentStage] = state === "stopped" ? "stopped" : "failed";
    }
    for (const id of stageIds) {
      if (id !== currentStage && !visitedStages.has(id)) stageStates[id] = "skipped";
    }
  } else if (currentStage in stageStates) {
    stageStates[currentStage] = statusForCurrentStage(run.status);
  }

  const stageDetails = {};
  const agentRuns = {};
  const cycles = {};
  const runs = {};
  for (const stageId of stageIds) {
    const visits = visibleHistory.filter((visit) => visit.stageId === stageId);
    if (visits.length === 0) continue;
    const startedAt = visits[0].enteredAt;
    const duration = visits.reduce((total, visit) =>
      total + elapsed(visit.enteredAt, visit.leftAt ?? run.updatedAt), 0);
    const files = latestUniqueLinks(visits, "openspec_artifact");
    stageDetails[stageId] = {
      facts: [
        { label: "Started", value: formatStarted(startedAt) },
        { label: "Duration", value: formatDuration(duration) },
      ],
      ...(files.length > 0 ? { files } : {}),
    };
    const attempts = visits
      .flatMap((visit) => visit.attempts ?? [])
      .filter((attempt) => attempt.transcriptAvailable);
    agentRuns[stageId] = attempts.map((attempt, index) =>
      transcriptForAttempt(attempt, index + 1, stageLabels[stageId]));
    cycles[stageId] = visits.length;
    runs[stageId] = attempts.length;
  }

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
  const currentLabel = stageLabels[currentStage] ?? titleCase(run.currentNode);
  const headline = pullRequestView && run.status === "succeeded"
    ? `Planning ${pullRequestView.label} merged${pullRequest.verified ? " and verified" : ""}`
    : run.status === "awaiting_human"
      ? "Waiting for human approval"
      : currentLabel ?? "Last confirmed workflow state";
  const observedConnections = [...new Set(visibleHistory.slice(1).flatMap((visit, index) => {
    const source = visibleHistory[index].stageId;
    const target = visit.stageId;
    return source && target && source !== target ? [`${source}->${target}`] : [];
  }))];

  return Object.freeze({
    key: issue.key,
    title: issue.title,
    listText: `Run ${run.sequence} · ${stateLabelFromStatus(run.status).toLowerCase()}`,
    state,
    stateLabel: stateLabelFromStatus(run.status),
    headline,
    currentStep: run.currentNode,
    currentStage,
    workflow,
    stageStates,
    stageDetails,
    pullRequest: pullRequestView,
    linear: { label: issue.key, title: issue.title, url: issue.url },
    agentRuns,
    cycles,
    runs,
    observedConnections,
    primaryAction: "View workflow result",
    evidence: {
      runId: run.id,
      definitionVersion: run.definitionVersion,
      definitionDigest: run.definitionDigest,
      freshness: run.freshness,
    },
  });
};

export const simpleIssueFromProjection = workflowIssueFromProjection;

const projectionForRun = async (runId, signal) => {
  const response = await fetch(`/api/runs/${encodeURIComponent(runId)}`, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error("The recorded workflow is unavailable right now.");
  return workflowIssueFromProjection(await response.json());
};

export const loadWorkflowIssue = async (issueKey, signal) => {
  const normalized = issueKey.trim().toUpperCase();
  const searchResponse = await fetch(`/api/issues?query=${encodeURIComponent(normalized)}`, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!searchResponse.ok) throw new Error("The issue search is unavailable right now.");
  const search = await searchResponse.json();
  const exact = Array.isArray(search.issues) ? search.issues.find((issue) => issue.key === normalized) : undefined;
  if (!exact) return null;
  const historyResponse = await fetch(`/api/issues/${encodeURIComponent(normalized)}/search`, {
    method: "POST",
    signal,
    headers: { Accept: "application/json" },
  });
  if (!historyResponse.ok) throw new Error(`The search history for ${normalized} could not be saved.`);
  const runsResponse = await fetch(`/api/issues/${encodeURIComponent(normalized)}/runs`, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!runsResponse.ok) throw new Error(`The recorded workflow for ${normalized} is unavailable right now.`);
  const runs = await runsResponse.json();
  const runId = runs.runs?.[0]?.id;
  if (typeof runId !== "string") return null;
  return projectionForRun(runId, signal);
};

export const loadWorkflowIssues = async (signal) => {
  const listResponse = await fetch("/api/workflows/issues", { signal, headers: { Accept: "application/json" } });
  if (!listResponse.ok) throw new Error("The recorded workflows are unavailable right now.");
  const list = await listResponse.json();
  if (!Array.isArray(list.issues)) throw new Error("The recorded workflow list is invalid.");
  const projections = await Promise.allSettled(list.issues.map((summary) => projectionForRun(summary.runId, signal)));
  const issues = projections
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value);
  return Object.freeze(Object.fromEntries(issues.map((issue) => [issue.key, issue])));
};

export const loadSimpleWorkflowIssues = loadWorkflowIssues;
