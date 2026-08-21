const issue = {
  key: "SAC-122",
  title: "Canary: SAC-121 PR #46 reconciled lifecycle v11 E2E",
  url: "https://linear.app/deos/issue/SAC-122/canary-sac-121-pr-46-reconciled-lifecycle-v11-e2e",
  observedAt: "2026-08-19T10:22:15.220Z",
};

const run = {
  id: "workflow:99426d9b-cda7-4db4-9136-692a95a0b090:6936d743-0000-4000-8000-000000000000:run:1",
  sequence: 1,
  status: "succeeded",
  definitionVersion: 11,
  startedAt: "2026-08-19T09:03:10.000Z",
  updatedAt: "2026-08-19T10:22:15.220Z",
  endedAt: "2026-08-19T10:22:15.220Z",
};

const nodes = [
  ["requirements", "Requirements", "requirements"],
  ["openspec_specs", "OpenSpec specs", "specification"],
  ["ddd_architecture", "DDD architecture", "architecture"],
  ["openspec_tasks", "Implementation plan", "implementation_plan"],
  ["implementation", "Implementation", "implementation"],
  ["code_review", "Code review", "validation"],
  ["final_approval", "Final approval", "approval"],
  ["sync_and_archive", "Sync and archive", "release"],
  ["done", "Done", "completed"],
] as const;

const history = nodes.map(([nodeId, label, stageId], index) => ({
  sequence: index + 1,
  nodeId,
  label,
  stageId,
  cycle: nodeId === "code_review" ? 2 : 1,
  state: "completed",
  enteredAt: new Date(Date.parse(run.startedAt) + index * 9 * 60_000).toISOString(),
  leftAt: new Date(Date.parse(run.startedAt) + (index + 1) * 9 * 60_000).toISOString(),
  attempts: ["requirements", "requirements_review", "ddd_architecture", "implementation", "code_review"].includes(nodeId)
    ? [{ state: "completed", outcome: "approved", startedAt: run.startedAt, endedAt: run.endedAt }]
    : [],
  waits: nodeId === "final_approval" ? [{ state: "consumed", startedAt: run.startedAt, endedAt: run.endedAt }] : [],
  links: nodeId === "implementation" ? [{ kind: "pull_request", label: "Pull request #46", url: "https://github.com/sachinkundu/deos/pull/46", createdAt: run.endedAt }] : [],
}));

const stageLabels = {
  requirements: "Requirements",
  specification: "Specification",
  architecture: "Architecture",
  implementation_plan: "Implementation plan",
  implementation: "Implementation",
  validation: "Validation",
  release: "Release",
  completed: "Workflow completed",
} as const;

export const demoApi = (path: string): unknown => {
  if (path.startsWith("/api/issues?")) return { issues: [issue] };
  if (path === `/api/issues/${issue.key}/runs`) return { issue, runs: [run] };
  if (path.startsWith("/api/runs/")) return {
    run: { ...run, freshness: run.updatedAt },
    stages: Object.entries(stageLabels).map(([id, label]) => ({
      id,
      label,
      state: "complete",
      visits: history.filter((visit) => visit.stageId === id).length,
    })),
    connections: [],
    history,
    unlinked: { attempts: 0, waits: 0 },
  };
  throw new Error("No matching workflow was found.");
};
