import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  MarkerType,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  ArrowClockwise,
  ArrowDown,
  ArrowSquareOut,
  CaretDown,
  CheckCircle,
  Code,
  Clock,
  FileText,
  FlowArrow,
  FolderSimple,
  GithubLogo,
  IntersectSquare,
  ListChecks,
  MagnifyingGlass,
  MoonStars,
  Pulse,
  Question,
  RocketLaunch,
  ShieldCheck,
  Stamp,
  Sun,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { simpleWorkflowPresentation } from "./simple-workflow.js";

const fullWorkflowDefinitions = [
  {
    id: "requirements_capture",
    label: "Capture requirements",
    phase: "Intent & Requirements",
    actor: "Specialist agent",
    kind: "agent",
    stageIndex: 0,
    stageId: "requirements",
    x: 780,
    y: 32,
    icon: FileText,
    summary: "Turn the issue intent into explicit requirements and completion outcomes.",
    result: "Requirements recorded",
  },
  {
    id: "requirements_review_full",
    label: "Review requirements",
    phase: "Intent & Requirements",
    actor: "Specialist agent",
    kind: "agent",
    stageIndex: 1,
    stageId: "requirements_review",
    x: 780,
    y: 150,
    icon: ListChecks,
    summary: "Check the requirements for clarity, conflicts, and missing outcomes.",
    result: "Requirements accepted",
  },
  {
    id: "requirements_approval",
    label: "Requirements approval",
    phase: "Intent & Requirements",
    actor: "Human gate",
    kind: "gate",
    stageIndex: 1,
    stageId: "requirements_review",
    x: 48,
    y: 268,
    icon: Stamp,
    summary: "A person accepts the requirements before specification work begins.",
    result: "Requirements approved",
  },
  {
    id: "specification",
    label: "Specification & scenarios",
    phase: "Specification & Architecture",
    actor: "Workflow artifact",
    kind: "artifact",
    stageIndex: 2,
    stageId: "workflow_update",
    x: 414,
    y: 386,
    icon: FileText,
    summary: "Record behavior, scenarios, and acceptance rules as the workflow contract.",
    result: "Specification ready",
  },
  {
    id: "architecture_design",
    label: "Design architecture",
    phase: "Specification & Architecture",
    actor: "Specialist agent",
    kind: "agent",
    stageIndex: 2,
    stageId: "workflow_update",
    x: 780,
    y: 504,
    icon: FlowArrow,
    summary: "Design the solution boundaries before implementation.",
    result: "Architecture designed",
  },
  {
    id: "architecture_review",
    label: "Review architecture",
    phase: "Specification & Architecture",
    actor: "Specialist agent",
    kind: "agent",
    stageIndex: 2,
    stageId: "workflow_update",
    x: 780,
    y: 622,
    icon: ListChecks,
    summary: "Review the proposed boundaries and return changes when needed.",
    result: "Architecture reviewed",
  },
  {
    id: "architecture_approval",
    label: "Architecture approval",
    phase: "Specification & Architecture",
    actor: "Human gate",
    kind: "gate",
    stageIndex: 4,
    stageId: "human_approval",
    x: 48,
    y: 740,
    icon: Stamp,
    summary: "A person approves the architecture and authorizes implementation.",
    result: "Architecture approved",
  },
  {
    id: "tasks_ready",
    label: "Plan implementation tasks",
    phase: "Implementation",
    actor: "Workflow artifact",
    kind: "artifact",
    stageIndex: 2,
    stageId: "workflow_update",
    x: 414,
    y: 858,
    icon: ListChecks,
    summary: "Break the approved specification and architecture into executable tasks.",
    result: "Tasks ready",
  },
  {
    id: "implementation_work",
    label: "Implement planned tasks",
    phase: "Implementation",
    actor: "Specialist agent",
    kind: "agent",
    stageIndex: 3,
    stageId: "implementation",
    x: 780,
    y: 976,
    icon: Code,
    summary: "Implement the approved tasks.",
    result: "Implementation complete",
  },
  {
    id: "validation",
    label: "Run validation",
    phase: "Implementation",
    actor: "Specialist agent",
    kind: "agent",
    stageIndex: 3,
    stageId: "implementation",
    x: 780,
    y: 1094,
    icon: ShieldCheck,
    summary: "Run the checks required by the planned change.",
    result: "Validation passed",
  },
  {
    id: "code_review",
    label: "Code review",
    phase: "Evidence & Release",
    actor: "Specialist agent",
    kind: "agent",
    stageIndex: 5,
    stageId: "changes_applied",
    x: 780,
    y: 1212,
    icon: GithubLogo,
    summary: "Review the change, requirements traceability, and implementation evidence.",
    result: "Code review passed",
  },
  {
    id: "evidence_verification",
    label: "Verify evidence",
    phase: "Evidence & Release",
    actor: "Specialist agent",
    kind: "agent",
    stageIndex: 6,
    stageId: "final_verification",
    x: 780,
    y: 1330,
    icon: ShieldCheck,
    summary: "Verify the evidence pack and confirm the promised outcomes are supported.",
    result: "Evidence certified",
  },
  {
    id: "release_approval",
    label: "Release approval",
    phase: "Evidence & Release",
    actor: "Human gate",
    kind: "gate",
    stageIndex: 6,
    stageId: "final_verification",
    x: 48,
    y: 1448,
    icon: Stamp,
    summary: "A person reviews the certified evidence and approves release.",
    result: "Release approved",
  },
  {
    id: "deploy_finalize",
    label: "Deploy & finalize release",
    phase: "Operations & Compounding",
    actor: "Workflow action",
    kind: "action",
    stageIndex: 7,
    stageId: "done",
    x: 414,
    y: 1566,
    icon: RocketLaunch,
    summary: "Release the approved change and finalize its delivery record.",
    result: "Release finalized",
  },
  {
    id: "sync_archive",
    label: "Sync knowledge & archive",
    phase: "Operations & Compounding",
    actor: "Specialist agent",
    kind: "agent",
    stageIndex: 7,
    stageId: "done",
    x: 780,
    y: 1684,
    icon: FolderSimple,
    summary: "Preserve the final artifacts and make the outcome available to future work.",
    result: "Workflow archived",
  },
  {
    id: "workflow_complete",
    label: "Workflow completed",
    phase: "Operations & Compounding",
    actor: "Workflow state",
    kind: "action",
    stageIndex: 7,
    stageId: "done",
    x: 414,
    y: 1802,
    icon: CheckCircle,
    summary: "The workflow is terminal, its outcome is recorded, and the complete history remains available.",
    result: "Completed successfully",
  },
];

const fullCurrentNodeByStep = {
  requirements: "requirements_capture",
  requirements_review: "requirements_review_full",
  workflow_update: "specification",
  implementation: "implementation_work",
  human_approval: "architecture_approval",
  changes_applied: "code_review",
  final_verification: "evidence_verification",
  done: "workflow_complete",
};

const filesByNode = {
  requirements_capture: ["proposal.md", "requirements.md"],
  requirements_review_full: ["requirements-review.md"],
  requirements_approval: ["approvals/requirements.json"],
  specification: ["specs/workflow-status/spec.md", "specs/workflow-status/scenarios.md"],
  architecture_design: ["design.md"],
  architecture_review: ["reviews/architecture.md"],
  architecture_approval: ["approvals/architecture.json"],
  tasks_ready: ["tasks.md"],
  implementation_work: ["src/workflow-status.ts"],
  validation: ["tests/workflow-status.test.ts", "evidence/validation-results.json"],
  code_review: ["reviews/code-review.md"],
  evidence_verification: ["evidence/evidence-pack.json", "evidence/verification.md"],
  release_approval: ["approvals/release.json"],
  deploy_finalize: ["release/release-record.json"],
  sync_archive: ["archive/workflow-summary.md"],
  workflow_complete: ["workflow/workflow-result.json"],
};

const workflowIcons = {
  claim: FlowArrow,
  planning: FileText,
  review: Stamp,
  merge: GithubLogo,
  complete: CheckCircle,
  stopped: WarningCircle,
};

const workflowDefinitions = simpleWorkflowPresentation.stages.map((stage) => ({
  ...stage,
  icon: workflowIcons[stage.icon],
}));

const currentNodeByStep = {
  ...simpleWorkflowPresentation.nodeToStage,
};

const issueDefinitions = {
  "SAC-130": {
    key: "SAC-130",
    title: "Simple planning workflow provider proof",
    listText: "Simple workflow succeeded",
    state: "finished",
    stateLabel: "Finished",
    headline: "Planning workflow completed",
    description: "The planning pull request was created, approved, merged, and verified.",
    currentStep: "done",
    completedThrough: 4,
    loopCount: 0,
    cycles: { claim: 1, planning: 1, review: 1, merge: 1, complete: 1 },
    primaryAction: "View planning result",
  },
};

const stateIcon = {
  active: Pulse,
  waiting: Clock,
  finished: CheckCircle,
  unknown: Question,
};

function FullWorkflowNode({ data, selected }) {
  const Icon = data.icon;
  return (
    <button
      type="button"
      className={`full-flow-node full-flow-node--${data.kind} full-flow-node--${data.status}${selected ? " is-selected" : ""}`}
      aria-label={`${data.label}: ${data.statusLabel}`}
    >
      <Handle type="target" position={Position.Top} id="top" className="node-handle" />
      <Handle type="source" position={Position.Top} id="top-out" className="node-handle" />
      <Handle type="source" position={Position.Bottom} id="bottom" className="node-handle" />
      <Handle type="target" position={Position.Bottom} id="bottom-in" className="node-handle" />
      <Handle type="target" position={Position.Left} id="left" className="node-handle" />
      <Handle type="source" position={Position.Left} id="left-out" className="node-handle" />
      <Handle type="target" position={Position.Right} id="right" className="node-handle" />
      <Handle type="source" position={Position.Right} id="right-out" className="node-handle" />
      <span className="full-node-icon" aria-hidden="true"><Icon size={20} weight="duotone" /></span>
      <span className="full-node-copy">
        <strong>{data.label}</strong>
        <span className="full-node-detail-row">
          <span className="full-node-status">{data.statusLabel}</span>
          {data.cycleBased && data.cycleCount > 0 && <span className="full-node-cycles">{data.cycleCount} {data.cycleCount === 1 ? "cycle" : "cycles"}</span>}
        </span>
      </span>
    </button>
  );
}

const nodeTypes = { fullWorkflow: FullWorkflowNode };

function statusForFullNode(issue, definition) {
  if (issue.state === "finished") return "completed";
  const definitionIndex = fullWorkflowDefinitions.findIndex((item) => item.id === definition.id);
  const currentIndex = fullWorkflowDefinitions.findIndex((item) => item.id === fullCurrentNodeByStep[issue.currentStep]);
  if (definitionIndex === currentIndex) return issue.state;
  if (currentIndex >= 0 && definitionIndex < currentIndex) return "completed";
  if (issue.state === "unknown") return definitionIndex <= issue.completedThrough ? "completed" : "unknown";
  return "future";
}

function buildRunGraph(issue) {
  const currentNodeId = fullCurrentNodeByStep[issue.currentStep];
  const currentIndex = fullWorkflowDefinitions.findIndex((item) => item.id === currentNodeId);
  const endIndex = issue.state === "finished" ? fullWorkflowDefinitions.length - 1 : currentIndex >= 0 ? currentIndex : issue.completedThrough;
  const baseSequence = fullWorkflowDefinitions.slice(0, Math.max(0, endIndex) + 1);
  const sequence = [];

  if (issue.loopCount > 0 && endIndex >= 1) {
    const capture = fullWorkflowDefinitions[0];
    const review = fullWorkflowDefinitions[1];
    for (let visit = 0; visit <= issue.loopCount; visit += 1) {
      sequence.push({ definition: capture, eventLabel: visit ? `Visit ${visit + 1}` : "Completed" });
      sequence.push({ definition: review, eventLabel: visit < issue.loopCount ? "Returned" : "Completed" });
    }
    sequence.push(...baseSequence.slice(2).map((definition) => ({ definition })));
  } else {
    sequence.push(...baseSequence.map((definition) => ({ definition })));
  }

  const lastCurrentIndex = sequence.map((item) => item.definition.id).lastIndexOf(currentNodeId);
  const nodes = sequence.map(({ definition, eventLabel }, index) => {
    const isCurrent = index === lastCurrentIndex && Boolean(currentNodeId);
    const status = isCurrent ? issue.state : "completed";
    return {
      id: `run-${definition.id}-${index}`,
      type: "fullWorkflow",
      position: { x: 414, y: 28 + index * 112 },
      selected: isCurrent,
      data: {
        ...definition,
        files: filesByNode[definition.id] || [],
        status,
        statusLabel: isCurrent ? issue.stateLabel : eventLabel || "Completed",
        runVisit: eventLabel?.startsWith("Visit") ? eventLabel : null,
      },
    };
  });

  const edges = sequence.slice(0, -1).map((item, index) => {
    const next = sequence[index + 1];
    const isReturn = item.definition.id === "requirements_review_full" && next.definition.id === "requirements_capture";
    return {
      id: `run-edge-${index}`,
      source: nodes[index].id,
      sourceHandle: "bottom",
      target: nodes[index + 1].id,
      targetHandle: "top",
      type: "smoothstep",
      label: isReturn ? "Changes requested" : undefined,
      markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
      className: isReturn ? "edge-loop edge-loop--observed" : nodes[index + 1].selected ? `edge-${issue.state}` : "edge-completed",
      labelBgPadding: isReturn ? [9, 5] : undefined,
      labelShowBg: isReturn || undefined,
      data: isReturn ? {
        inspector: {
          title: "Requirements changed",
          description: "Requirements review returned the run to requirement capture.",
          from: "Review requirements",
          to: "Capture requirements",
          reason: "Changes requested",
          occurrence: "Observed return",
        },
      } : undefined,
    };
  });

  return { nodes, edges, height: Math.max(560, sequence.length * 112 + 64) };
}

function buildFullGraph(issue) {
  const nodes = fullWorkflowDefinitions.map((definition) => {
    const status = statusForFullNode(issue, definition);
    const isCurrent = fullCurrentNodeByStep[issue.currentStep] === definition.id;
    return {
      id: definition.id,
      type: "fullWorkflow",
      position: { x: definition.x, y: definition.y },
      selected: isCurrent,
      data: {
        ...definition,
        files: filesByNode[definition.id] || [],
        status,
        statusLabel: isCurrent ? issue.stateLabel : status === "completed" ? "Completed" : status === "unknown" ? "Unknown" : "Available path",
      },
    };
  });

  const statusById = Object.fromEntries(nodes.map((node) => [node.id, node.data.status]));
  const mainEdges = fullWorkflowDefinitions.slice(0, -1).map((definition, index) => {
    const target = fullWorkflowDefinitions[index + 1];
    const targetStatus = statusById[target.id];
    return {
      id: `full-${definition.id}-${target.id}`,
      source: definition.id,
      sourceHandle: "bottom",
      target: target.id,
      targetHandle: "top",
      type: "smoothstep",
      markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
      className: targetStatus === "completed" ? "edge-completed" : targetStatus === issue.state ? `edge-${issue.state}` : "edge-future",
    };
  });

  const loopEdges = [];
  if (issue.loopCount > 0) {
    loopEdges.push({
      id: "full-requirements-loop",
      source: "requirements_review_full",
      sourceHandle: "right-out",
      target: "requirements_capture",
      targetHandle: "right-in",
      type: "smoothstep",
      label: `Observed · ${issue.loopCount} ${issue.loopCount === 1 ? "return" : "returns"}`,
      markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
      className: "edge-loop edge-loop--observed",
      labelBgPadding: [9, 5],
      labelShowBg: true,
      data: {
        inspector: {
          title: "Requirements changed",
          description: "The requirements review returned the run to requirement capture before approval.",
          from: "Review requirements",
          to: "Capture requirements",
          reason: "Changes requested",
          occurrence: `${issue.loopCount} ${issue.loopCount === 1 ? "return" : "returns"}`,
        },
      },
    });
  }

  loopEdges.push(
    {
      id: "full-architecture-loop",
      source: "architecture_approval",
      sourceHandle: "right-out",
      target: "specification",
      targetHandle: "left-in",
      type: "smoothstep",
      label: "Revise design",
      markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
      className: "edge-loop edge-loop--possible",
      labelBgPadding: [9, 5],
      labelShowBg: true,
      data: { inspector: { title: "Architecture revision", description: "If architecture approval requests changes, the workflow returns to the specification before another review.", from: "Architecture approval", to: "Specification & scenarios", reason: "Changes requested", occurrence: "Possible return" } },
    },
    {
      id: "full-code-loop",
      source: "code_review",
      sourceHandle: "right-out",
      target: "implementation_work",
      targetHandle: "right-in",
      type: "smoothstep",
      label: "Code fixes",
      markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
      className: "edge-loop edge-loop--possible",
      labelBgPadding: [9, 5],
      labelShowBg: true,
      data: { inspector: { title: "Code fixes", description: "Review feedback returns the work to implementation, followed by validation and another review.", from: "Code review", to: "Implement planned tasks", reason: "Review changes requested", occurrence: "Possible return" } },
    },
    {
      id: "full-verification-loop",
      source: "evidence_verification",
      sourceHandle: "left-out",
      target: "implementation_work",
      targetHandle: "left-in",
      type: "smoothstep",
      label: "More evidence needed",
      markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
      className: "edge-loop edge-loop--possible",
      labelBgPadding: [9, 5],
      labelShowBg: true,
      data: { inspector: { title: "Verification failed", description: "Insufficient evidence returns the workflow to implementation, followed by validation and review.", from: "Verify evidence", to: "Implement planned tasks", reason: "More work needed", occurrence: "Possible return" } },
    },
    {
      id: "full-release-loop",
      source: "release_approval",
      sourceHandle: "right-out",
      target: "code_review",
      targetHandle: "left-in",
      type: "smoothstep",
      label: "Release changes",
      markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
      className: "edge-loop edge-loop--possible",
      labelBgPadding: [9, 5],
      labelShowBg: true,
      data: { inspector: { title: "Release changes requested", description: "The release gate can return the work to review before another evidence and approval cycle.", from: "Release approval", to: "Code review", reason: "Release changes requested", occurrence: "Possible return" } },
    },
  );

  return { nodes, edges: [...mainEdges, ...loopEdges], height: 1940 };
}

function statusForWorkflowNode(issue, definition) {
  if (issue.state === "finished") return definition.id === "stopped" ? "future" : "completed";
  const definitionIndex = workflowDefinitions.findIndex((item) => item.id === definition.id);
  const currentIndex = workflowDefinitions.findIndex((item) => item.id === currentNodeByStep[issue.currentStep]);
  if (definitionIndex === currentIndex) return issue.state;
  if (currentIndex >= 0 && definitionIndex < currentIndex) return "completed";
  if (issue.state === "unknown") return definitionIndex <= issue.completedThrough ? "completed" : "unknown";
  return "future";
}

function generatedFilesForNode(definition, status, isCurrent) {
  if (status === "completed") return definition.files;
  if (!isCurrent) return [];
  return definition.files.slice(0, Math.max(1, definition.files.length - 1));
}

function agentRunsForNode(definition, cycleCount) {
  return Array.from({ length: cycleCount }, (_, cycleIndex) =>
    definition.agents.map((agent) => ({
      id: `${definition.id}-${cycleIndex + 1}-${agent}`,
      agent,
      cycle: cycleIndex + 1,
    })),
  ).flat();
}

function buildGraph(issue) {
  const nodes = workflowDefinitions.map((definition) => {
    const status = statusForWorkflowNode(issue, definition);
    const isCurrent = currentNodeByStep[issue.currentStep] === definition.id;
    const cycleCount = status === "completed" || isCurrent ? issue.cycles?.[definition.id] || 1 : 0;
    return {
      id: definition.id,
      type: "fullWorkflow",
      position: { x: definition.x, y: definition.y },
      selected: isCurrent,
      data: {
        ...definition,
        files: generatedFilesForNode(definition, status, isCurrent),
        cycleCount,
        agentRuns: agentRunsForNode(definition, cycleCount),
        status,
        statusLabel: isCurrent ? (issue.state === "waiting" ? issue.headline : issue.stateLabel) : status === "completed" ? "Completed" : status === "unknown" ? "Unknown" : "Upcoming",
      },
    };
  });

  const statusById = Object.fromEntries(nodes.map((node) => [node.id, node.data.status]));
  const edges = simpleWorkflowPresentation.connections.map((connection, index) => {
    const targetStatus = statusById[connection.target];
    const isObservedReturn = connection.kind === "return" && (issue.cycles?.planning ?? 0) > 1;
    return {
      id: `${connection.source}-${connection.target}-${index}`,
      source: connection.source,
      sourceHandle: connection.sourceHandle,
      target: connection.target,
      targetHandle: connection.targetHandle,
      type: "smoothstep",
      label: connection.label,
      markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
      className: connection.kind === "return"
        ? `edge-loop ${isObservedReturn ? "edge-loop--observed" : "edge-loop--possible"}`
        : connection.kind === "branch"
          ? "edge-future"
          : targetStatus === "completed"
            ? "edge-completed"
            : targetStatus === issue.state
              ? `edge-${issue.state}`
              : "edge-future",
      labelBgPadding: connection.label ? [9, 5] : undefined,
      labelShowBg: Boolean(connection.label),
    };
  });

  return { nodes, edges, height: 470 };
}

function IssueRow({ issue, selected, onSelect }) {
  const Icon = stateIcon[issue.state];
  return (
    <button
      type="button"
      className={`issue-row issue-row--${issue.state}${selected ? " is-selected" : ""}`}
      onClick={() => onSelect(issue.key)}
      aria-pressed={selected}
    >
      <span className="issue-state-icon"><Icon size={21} weight="bold" /></span>
      <span className="issue-copy">
        <span className="issue-key">{issue.key}</span>
        <span className="issue-list-text">{issue.listText}</span>
      </span>
      <span className="issue-state-label"><span className="state-dot" />{issue.stateLabel}</span>
    </button>
  );
}

function ThemeControl({ value, onChange }) {
  const Icon = value === "light" ? Sun : MoonStars;
  return (
    <label className="theme-control">
      <Icon size={16} />
      <span className="theme-label">Theme</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} aria-label="Theme">
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
      <CaretDown size={13} aria-hidden="true" />
    </label>
  );
}

function AppHeader({ theme, onThemeChange }) {
  return (
    <header className="app-header">
      <div className="brand">
        <IntersectSquare size={29} weight="duotone" />
        <strong>DEOS</strong>
        <span className="brand-divider" />
        <span className="product-name">Workflow Map</span>
      </div>
      <div className="header-tools">
        <ThemeControl value={theme} onChange={onThemeChange} />
      </div>
    </header>
  );
}

function SideBar({ selectedKey, onSelect, search, setSearch, onSearch }) {
  const filtered = Object.values(issueDefinitions).filter((issue) => issue.key.includes(search.trim().toUpperCase()) || issue.title.toLowerCase().includes(search.trim().toLowerCase()));
  return (
    <aside className="issue-sidebar">
      <form className="issue-search" onSubmit={onSearch}>
        <label htmlFor="issue-search-input">Find issue</label>
        <div className="search-field">
          <MagnifyingGlass size={18} />
          <input
            id="issue-search-input"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="SAC-130"
            autoComplete="off"
          />
          {search && <button type="button" onClick={() => setSearch("")} aria-label="Clear search"><X size={15} /></button>}
          <kbd>/</kbd>
        </div>
      </form>
      <nav className="issue-list" aria-label="Issues">
        {filtered.map((issue) => (
          <IssueRow key={issue.key} issue={issue} selected={selectedKey === issue.key} onSelect={onSelect} />
        ))}
        {!filtered.length && (
          <div className="no-results"><WarningCircle size={22} /><strong>No issue found</strong><span>Try SAC-130 or clear the search.</span></div>
        )}
      </nav>
    </aside>
  );
}

function StatusLegend() {
  return (
    <div className="status-legend" aria-label="Workflow state legend">
      <span className="legend-item legend-completed"><CheckCircle size={17} />Completed</span>
      <span className="legend-item legend-waiting"><Clock size={17} />Waiting</span>
      <span className="legend-item legend-active"><Pulse size={17} />Active</span>
      <span className="legend-item legend-future"><Question size={17} />Future / unknown</span>
    </div>
  );
}

function StepInspector({ selection, issue, onClose, onExternal, onTranscript }) {
  if (!selection) return null;
  const step = selection.step;
  const definitionIndex = step ? workflowDefinitions.findIndex((item) => item.id === step.id) : -1;
  const status = step?.status || "completed";
  const isCurrent = Boolean(selection.isCurrent);
  const usesPullRequest = ["planning", "review", "merge", "complete"].includes(step?.id);
  const prStatus = issue.state === "finished" ? "Merged" : issue.state === "active" ? "Draft" : issue.state === "waiting" ? "Open" : "Unknown";
  return (
    <aside className="step-inspector" aria-label="Workflow detail">
      <div className="inspector-header">
        <div>
          <span className="eyebrow">{step?.phase}</span>
          <h2>{step?.label}</h2>
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close detail"><X size={18} /></button>
      </div>
      <div className="inspector-body">
          <div className={`detail-status detail-status--${isCurrent ? issue.state : status}`}>
            {isCurrent && issue.state === "waiting" ? <Clock size={18} /> : status === "completed" ? <CheckCircle size={18} /> : <FlowArrow size={18} />}
            {isCurrent ? (issue.state === "waiting" ? issue.headline : issue.stateLabel) : status === "completed" ? "Completed" : "Upcoming"}
          </div>
          <dl className="detail-list">
            <div><dt>Result</dt><dd>{isCurrent ? issue.headline : step?.result}</dd></div>
          </dl>
          {step?.summary && <p className="detail-summary">{step.summary}</p>}
          {step?.cycleCount > 0 && (
            <section className="inspector-cycles" aria-label="Cycle count">
              <strong>{step.cycleCount}</strong>
              <span>{step.cycleCount === 1 ? "Cycle" : "Cycles"}</span>
            </section>
          )}
          {step?.agentRuns?.length > 0 && <section className="inspector-agents">
            <h3>Agent</h3>
            {step.agentRuns.map((run) => (
              <button type="button" key={run.id} onClick={() => onTranscript(`${run.agent} · Cycle ${run.cycle}`)}>
                <FileText size={18} />
                <span><strong>{run.agent}</strong><small>Cycle {run.cycle}</small></span>
                <ArrowSquareOut size={14} />
              </button>
            ))}
          </section>}
          {usesPullRequest && status !== "future" && status !== "unknown" && <section className="inspector-links">
            <h3>Pull request</h3>
            <button type="button" onClick={() => onExternal("Planning PR #59")}><GithubLogo size={19} weight="fill" /><span><strong>PR #59</strong><small>{prStatus}</small></span><ArrowSquareOut size={15} /></button>
          </section>}
          {step?.files?.length > 0 && <section className="inspector-files">
            <h3>Files</h3>
            {step?.files?.map((file) => (
              <button type="button" key={file} onClick={() => onExternal(file)}><FileText size={18} /><span>{file}</span><ArrowSquareOut size={14} /></button>
            ))}
          </section>}
          <section className="inspector-links">
            <h3>Linked work</h3>
            <button type="button" onClick={() => onExternal(`Linear issue ${issue.key}`)}><FlowArrow size={19} /><span><strong>{issue.key}</strong><small>Linear</small></span><ArrowSquareOut size={15} /></button>
            {!usesPullRequest && definitionIndex >= 1 && status !== "future" && status !== "unknown" && (
              <button type="button" onClick={() => onExternal("Planning pull request")}><GithubLogo size={19} weight="fill" /><span><strong>Planning pull request</strong><small>{prStatus}</small></span><ArrowSquareOut size={15} /></button>
            )}
          </section>
      </div>
    </aside>
  );
}

function ExternalPreview({ label, onClose }) {
  if (!label) return null;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="external-modal" role="dialog" aria-modal="true" aria-labelledby="external-title" onMouseDown={(event) => event.stopPropagation()}>
        <span className="modal-icon"><ArrowSquareOut size={24} /></span>
        <span className="eyebrow">External destination</span>
        <h2 id="external-title">{label}</h2>
        <p>In the real product, this opens the linked work in a new browser tab. External navigation is disabled in this local prototype.</p>
        <button type="button" className="primary-button" onClick={onClose}>Back to workflow</button>
      </section>
    </div>
  );
}

function TranscriptPreview({ label, onClose }) {
  if (!label) return null;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="external-modal" role="dialog" aria-modal="true" aria-labelledby="transcript-title" onMouseDown={(event) => event.stopPropagation()}>
        <span className="modal-icon"><FileText size={24} /></span>
        <span className="eyebrow">Agent transcript</span>
        <h2 id="transcript-title">{label}</h2>
        <p>This opens the transcript for this agent run. Transcript formatting will be designed in a later pass.</p>
        <button type="button" className="primary-button" onClick={onClose}>Back to workflow</button>
      </section>
    </div>
  );
}

function WorkflowWorkspace({ issue, selection, setSelection, onExternal, onTranscript, onRefresh }) {
  const graph = useMemo(() => buildGraph(issue), [issue]);
  const [nodes, setNodes, onNodesChange] = useNodesState(graph.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(graph.edges);

  useEffect(() => {
    setNodes(graph.nodes);
    setEdges(graph.edges);
  }, [graph, setNodes, setEdges]);

  const onNodeClick = useCallback((_, node) => setSelection({ kind: "node", id: node.id, step: node.data, isCurrent: node.selected }), [setSelection]);
  const jumpToCurrent = useCallback(() => {
    document.querySelector(".full-flow-node.is-selected")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  const CurrentIcon = stateIcon[issue.state];
  const currentDefinition = workflowDefinitions.find((item) => item.id === currentNodeByStep[issue.currentStep]);
  return (
    <main className="workflow-workspace">
      <section className="workspace-heading">
        <div className="issue-title-line"><strong>{issue.key}</strong><h1>{issue.title}</h1></div>
        <div className="workflow-identity"><strong>{simpleWorkflowPresentation.label}</strong><span>Definition v{simpleWorkflowPresentation.version}</span></div>
      </section>

      <section className={`workflow-state-bar workflow-state-bar--${issue.state}`}>
        <CurrentIcon size={19} weight="bold" />
        <strong>{issue.stateLabel}</strong>
        <span>{currentDefinition?.label || "Last confirmed workflow node unavailable"}</span>
        {issue.state === "unknown" && <button type="button" onClick={onRefresh}><ArrowClockwise size={16} />Retry</button>}
      </section>

      <section className="graph-section" aria-label="Workflow map">
        <div className="graph-toolbar">
          <div className="graph-view-actions">
            {currentDefinition && <button type="button" className="direction-chip" onClick={jumpToCurrent}><ArrowDown size={15} />Current node</button>}
          </div>
          <StatusLegend />
        </div>
        <div className="graph-canvas graph-canvas--workflow" style={{ height: graph.height, minHeight: graph.height }}>
          <ReactFlow
            key={issue.key}
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            fitView
            fitViewOptions={{ padding: 0.05, minZoom: 0.78, maxZoom: 1 }}
            minZoom={0.72}
            maxZoom={1.15}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={24} size={1} className="graph-background" />
            <Controls showInteractive={false} position="bottom-right" />
          </ReactFlow>
        </div>
      </section>
      <StepInspector selection={selection} issue={issue} onClose={() => setSelection(null)} onExternal={onExternal} onTranscript={onTranscript} />
    </main>
  );
}

export function App() {
  const [selectedKey, setSelectedKey] = useState("SAC-130");
  const [search, setSearch] = useState("");
  const [selection, setSelection] = useState(null);
  const [externalIntent, setExternalIntent] = useState(null);
  const [transcriptIntent, setTranscriptIntent] = useState(null);
  const [theme, setTheme] = useState(() => localStorage.getItem("deos-prototype-theme") || "dark");
  const [toast, setToast] = useState("");

  const issue = issueDefinitions[selectedKey];

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const applyTheme = () => {
      const resolved = theme === "system" ? (media.matches ? "light" : "dark") : theme;
      document.documentElement.dataset.theme = resolved;
      document.documentElement.style.colorScheme = resolved;
    };
    applyTheme();
    media.addEventListener("change", applyTheme);
    localStorage.setItem("deos-prototype-theme", theme);
    return () => media.removeEventListener("change", applyTheme);
  }, [theme]);

  useEffect(() => {
    const handleKey = (event) => {
      if (event.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) {
        event.preventDefault();
        document.getElementById("issue-search-input")?.focus();
      }
      if (event.key === "Escape") {
        setSelection(null);
        setExternalIntent(null);
        setTranscriptIntent(null);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(""), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const selectIssue = (key) => {
    setSelectedKey(key);
    setSearch("");
    setSelection(null);
  };

  const submitSearch = (event) => {
    event.preventDefault();
    const match = Object.keys(issueDefinitions).find((key) => key === search.trim().toUpperCase());
    if (match) selectIssue(match);
    else setToast("No matching issue in this prototype");
  };

  const refresh = () => {
    setToast("Status is still unconfirmed");
  };

  return (
    <div className="app-shell">
      <AppHeader theme={theme} onThemeChange={setTheme} />
      <div className="app-body">
        <SideBar selectedKey={selectedKey} onSelect={selectIssue} search={search} setSearch={setSearch} onSearch={submitSearch} />
        <WorkflowWorkspace
          issue={issue}
          selection={selection}
          setSelection={setSelection}
          onExternal={setExternalIntent}
          onTranscript={setTranscriptIntent}
          onRefresh={refresh}
        />
      </div>
      <ExternalPreview label={externalIntent} onClose={() => setExternalIntent(null)} />
      <TranscriptPreview label={transcriptIntent} onClose={() => setTranscriptIntent(null)} />
      {toast && <div className="toast" role="status"><CheckCircle size={18} />{toast}</div>}
    </div>
  );
}
