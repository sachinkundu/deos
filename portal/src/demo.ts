const issue = {
  key: "SAC-148",
  title: "Create a Google search summary CLI",
  url: "https://linear.app/sachinkundu/issue/SAC-148/create-a-google-search-summary-cli",
  observedAt: "2026-09-01T09:39:21.413Z",
};

const run = {
  id: "workflow:99426d9b-cda7-4db4-9136-692a95a0b090:6936d743-0000-4000-8000-000000000000:run:1",
  sequence: 2,
  status: "succeeded",
  definitionVersion: 17,
  startedAt: "2026-09-01T08:37:48.520Z",
  updatedAt: "2026-09-01T09:39:21.413Z",
  endedAt: "2026-09-01T09:39:21.413Z",
};

const nodes = [
  ["claim_issue", "Claim issue", "claim"],
  ["planning_author", "Planning author", "planning"],
  ["self_discovery", "Self discovery", "planning"],
  ["planning_self_repair", "Planning self repair", "planning"],
  ["self_recheck_before_publish", "Self recheck before publish", "planning"],
  ["publish_initial", "Publish initial", "planning"],
  ["independent_discovery", "Independent discovery", "independent_review"],
  ["planning_independent_response", "Planning independent response", "independent_review"],
  ["publish_update", "Publish update", "independent_review"],
  ["final_trace", "Final trace", "independent_review"],
  ["publish_author_response", "Publish author response", "independent_review"],
  ["planning_review", "Planning review", "review"],
  ["merge_planning_pr", "Merge planning PR", "plan_merge"],
  ["verify_planning_merge", "Verify planning merge", "plan_merge"],
  ["design_author", "Design author", "design"],
  ["publish_design", "Publish design", "design"],
  ["design_review", "Design review", "review"],
  ["start_new_design_round", "Start new design round", "design"],
  ["design_revision_author", "Design revision author", "design"],
  ["publish_design", "Publish design", "design"],
  ["design_review", "Design review", "review"],
  ["merge_design_pr", "Merge design PR", "design_merge"],
  ["done", "Done", "complete"],
] as const;

const demoAttemptId = "11111111-1111-4111-8111-111111111111";

const history = nodes.map(([nodeId, label, stageId], index) => ({
  sequence: index + 1,
  nodeId,
  label,
  stageId,
  cycle: nodeId === "design_review" || nodeId === "publish_design"
    ? nodes.slice(0, index).filter(([prior]) => prior === nodeId).length + 1
    : 1,
  recovered: false,
  state: nodeId === "done" ? "succeeded" : "completed",
  enteredAt: new Date(Date.parse(run.startedAt) + index * 160_000).toISOString(),
  leftAt: new Date(Date.parse(run.startedAt) + (index + 1) * 160_000).toISOString(),
  attempts: ["planning_author", "self_discovery", "planning_self_repair", "independent_discovery", "planning_independent_response", "final_trace", "design_author", "design_revision_author"].includes(nodeId)
    ? [{
        id: demoAttemptId,
        state: "completed",
        outcome: nodeId === "self_discovery" ? "findings" : "completed",
        startedAt: run.startedAt,
        endedAt: run.endedAt,
        transcriptAvailable: nodeId === "planning_author",
      }]
    : [],
  waits: nodeId === "planning_review" || nodeId === "design_review" ? [{ state: "consumed", startedAt: run.startedAt, endedAt: run.endedAt }] : [],
  links: nodeId === "planning_review"
    ? [{ kind: "pull_request", label: "Planning PR #9", url: "https://github.com/sachinkundu/deos-sample-project/pull/9", createdAt: run.endedAt }]
    : nodeId === "design_review"
      ? [{ kind: "pull_request", label: "Design PR #10", url: "https://github.com/sachinkundu/deos-sample-project/pull/10", createdAt: run.endedAt }]
      : [],
  gate: nodeId === "planning_review" ? {
    gate_kind: "plan" as const,
    work_type: "proposal_and_specs" as const,
    round: 1,
    state: "merge_authorized",
    pull_request_number: 9,
    pull_request_url: "https://github.com/sachinkundu/deos-sample-project/pull/9",
    approved_head_sha: "35aa71b906cd136226cc3ba8ba2bea27c97263a5",
    decision_outcome: "merge_authorized",
  } : nodeId === "design_review" ? {
    gate_kind: "design" as const,
    work_type: "design" as const,
    round: nodes.slice(0, index).filter(([prior]) => prior === "design_review").length + 1,
    state: index < 20 ? "revision_requested" : "merge_authorized",
    pull_request_number: 10,
    pull_request_url: "https://github.com/sachinkundu/deos-sample-project/pull/10",
    approved_head_sha: index < 20 ? "c5064912660502b5b1af15bf4fe856976a72e238" : "4ce31c516c55ed434348cdebfe2a09002952d3d7",
    decision_outcome: index < 20 ? "revision_requested" : "merge_authorized",
  } : null,
}));

const stageLabels = {
  claim: "Claim issue",
  planning: "Create planning PR",
  independent_review: "Independent review",
  review: "Human approval",
  plan_merge: "Merge plan & check",
  design: "Create design PR",
  design_merge: "Merge design & check",
  complete: "Completed",
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
    reviewAvailable: true,
    pullRequest: {
      number: 9,
      url: "https://github.com/sachinkundu/deos-sample-project/pull/9",
      status: "Merged",
      verified: true,
    },
    workProducts: {
      planning: {
        number: 9,
        url: "https://github.com/sachinkundu/deos-sample-project/pull/9",
        status: "Merged",
        verified: true,
      },
      design: {
        number: 10,
        url: "https://github.com/sachinkundu/deos-sample-project/pull/10",
        status: "Merged",
        headSha: "4ce31c516c55ed434348cdebfe2a09002952d3d7",
        baseCommit: "b050aa44f6382ade94a4ee4723825d74d02cd633",
      },
    },
    gateVisits: history.filter((visit) => visit.gate !== null).map((visit) => ({
      visitSequence: visit.sequence,
      gateKind: visit.gate!.gate_kind,
      workType: visit.gate!.work_type,
      round: visit.gate!.round,
      state: visit.gate!.state,
      pullRequest: { number: visit.gate!.pull_request_number, url: visit.gate!.pull_request_url },
      approvedHeadSha: visit.gate!.approved_head_sha,
      decision: visit.gate!.decision_outcome,
      active: false,
    })),
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
