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

const demoAttemptId = "11111111-1111-4111-8111-111111111111";

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
    ? [{
        id: demoAttemptId,
        state: "completed",
        outcome: "approved",
        startedAt: run.startedAt,
        endedAt: run.endedAt,
        transcriptAvailable: nodeId === "requirements",
      }]
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
  if (path === "/api/settings/routes") return {
    routes: [
      {
        projectId: "99426d9b-cda7-4db4-9136-692a95a0b090",
        projectName: "deos-sample-project",
        repository: "sachinkundu/deos-sample-project",
        githubInstallationId: "154095438",
        definitionId: "simple-traceability",
        definitionVersion: 13,
        definitionDigest: "a".repeat(64),
        startStateName: "Todo",
        humanGateStateId: "71738607-03fd-49f2-b4be-b2aac29ccd13",
        dispatchEnabled: true,
        repositoryRevision: 1,
        workflowRevision: 2,
        independentReviewProvider: "openrouter",
        independentReviewModel: "deepseek/deepseek-v4-pro",
        independentReviewRevision: 1,
        routeRevision: 2,
        routeDigest: "b".repeat(64),
        updatedBy: "sachinkundu@gmail.com",
        updatedAt: "2026-08-31T09:15:00.000Z",
        accessState: "passed",
        accessCheckedAt: "2026-08-31T09:14:42.000Z",
        accessPermissionsDigest: "c".repeat(64),
        githubSettingsUrl: "https://github.com/settings/installations/154095438",
        activeRuns: 1,
      },
      {
        projectId: "b0b6265d-5e61-4315-9ef4-724ddb391700",
        projectName: "deos-sample-project-2",
        repository: "sachinkundu/deos-sample-project-2",
        githubInstallationId: "154095438",
        definitionId: "simple-traceability",
        definitionVersion: 13,
        definitionDigest: "a".repeat(64),
        startStateName: "Todo",
        humanGateStateId: "71738607-03fd-49f2-b4be-b2aac29ccd13",
        dispatchEnabled: false,
        repositoryRevision: 1,
        workflowRevision: 1,
        independentReviewProvider: "openrouter",
        independentReviewModel: "deepseek/deepseek-v4-pro",
        independentReviewRevision: 1,
        routeRevision: 1,
        routeDigest: "d".repeat(64),
        updatedBy: "sachinkundu@gmail.com",
        updatedAt: "2026-08-31T09:20:00.000Z",
        accessState: "passed",
        accessCheckedAt: "2026-08-31T09:19:50.000Z",
        accessPermissionsDigest: "c".repeat(64),
        githubSettingsUrl: "https://github.com/settings/installations/154095438",
        activeRuns: 0,
      },
    ],
    linear: {
      state: "ready",
      values: [
        { projectId: "99426d9b-cda7-4db4-9136-692a95a0b090", name: "deos-sample-project", url: "https://linear.app", team: { id: "team", name: "SAC", key: "SAC" } },
        { projectId: "b0b6265d-5e61-4315-9ef4-724ddb391700", name: "deos-sample-project-2", url: "https://linear.app", team: { id: "team", name: "SAC", key: "SAC" } },
      ],
    },
    github: {
      state: "ready",
      values: [{
        installationId: "154095438",
        accountLogin: "sachinkundu",
        settingsUrl: "https://github.com/settings/installations/154095438",
        suspended: false,
        repositories: ["deos", "deos-sample-project", "deos-sample-project-2"].map((name, index) => ({
          repositoryId: String(1330744912 + index),
          fullName: `sachinkundu/${name}`,
          defaultBranch: "main",
          installationId: "154095438",
          accountLogin: "sachinkundu",
          settingsUrl: "https://github.com/settings/installations/154095438",
          access: "ready",
        })),
      }],
    },
    supportedReviewModels: ["deepseek/deepseek-v4-pro"],
  };
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
  if (path === `/api/attempts/${demoAttemptId}/transcript`) {
    const values = [
      { type: "status", timestamp: run.startedAt, message: "Planning work started." },
      { type: "assistant_message", timestamp: "2026-08-19T09:04:00.000Z", text: "I am reading the issue and current workflow context." },
      { type: "tool_call", timestamp: "2026-08-19T09:04:14.000Z", tool_name: "read_file", summary: "Read the approved planning inputs." },
      { type: "tool_result", timestamp: "2026-08-19T09:04:15.000Z", tool_name: "read_file", summary: "The planning inputs were loaded." },
      { type: "assistant_message", timestamp: "2026-08-19T09:08:10.000Z", text: "The proposal is ready for review." },
    ];
    const records = values.map((value, index) => ({ number: index + 1, raw: JSON.stringify(value), value }));
    return {
      attemptId: demoAttemptId,
      runId: run.id,
      runSequence: run.sequence,
      issueKey: issue.key,
      nodeId: "requirements",
      byteSize: records.reduce((total, record) => total + record.raw.length + 1, 0),
      sha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      eventCount: records.length,
      records,
    };
  }
  throw new Error("No matching workflow was found.");
};
