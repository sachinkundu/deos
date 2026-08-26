export const sac130RecordedRun = Object.freeze({
  key: "SAC-130",
  title: "Add Microsoft Entra login",
  listText: "Recorded run · succeeded",
  state: "finished",
  stateLabel: "Finished",
  headline: "Planning PR #1 merged and verified",
  description: "The simple version-4 workflow created an OpenSpec plan, received human approval, merged the planning pull request, and verified the merge.",
  currentStep: "done",
  stageStates: {
    claim: "completed",
    planning: "completed",
    review: "completed",
    merge: "completed",
    complete: "completed",
    stopped: "future",
  },
  stageDetails: {
    claim: {
      result: "Issue claimed and moved to In Progress",
      summary: "DEOS delegated SAC-130 and moved it from Todo to In Progress to start the recorded run.",
      facts: [
        { label: "Started", value: "25 Aug 2026 · 09:48:47 UTC" },
        { label: "Transition", value: "Todo → In Progress" },
        { label: "Duration", value: "1.0 sec" },
      ],
    },
    planning: {
      result: "OpenSpec plan published as PR #1",
      summary: "The Planning Agent created a proposal and a complete Entra login delta specification, validated both, and published them for review.",
      facts: [
        { label: "Started", value: "25 Aug 2026 · 09:49:00 UTC" },
        { label: "Duration", value: "5 min 16 sec" },
        { label: "Evidence", value: "5 accepted artifacts · 51.4 KB" },
        { label: "Validation", value: "4 checks passed" },
      ],
      files: [
        {
          label: "openspec/changes/sac-130/.openspec.yaml",
          url: "https://github.com/sachinkundu/deos-sample-project/blob/9270b93d31c653f15714509a8f841d98a13c6e46/openspec/changes/sac-130/.openspec.yaml",
        },
        {
          label: "openspec/changes/sac-130/proposal.md",
          url: "https://github.com/sachinkundu/deos-sample-project/blob/9270b93d31c653f15714509a8f841d98a13c6e46/openspec/changes/sac-130/proposal.md",
        },
        {
          label: "openspec/changes/sac-130/specs/entra-login/spec.md",
          url: "https://github.com/sachinkundu/deos-sample-project/blob/9270b93d31c653f15714509a8f841d98a13c6e46/openspec/changes/sac-130/specs/entra-login/spec.md",
        },
      ],
    },
    review: {
      result: "Plan approved in Linear",
      summary: "SAC-130 entered Human Review. A person approved it by moving the issue to Merging 46 seconds later.",
      facts: [
        { label: "Entered", value: "25 Aug 2026 · 09:54:18 UTC" },
        { label: "Decision", value: "Human Review → Merging" },
        { label: "Wait", value: "46 sec" },
      ],
    },
    merge: {
      result: "PR #1 merged and the merge was verified",
      summary: "The workflow merged the approved planning pull request, then confirmed the recorded pull request was merged before continuing.",
      facts: [
        { label: "Merged", value: "25 Aug 2026 · 09:55:18 UTC" },
        { label: "Merge commit", value: "9270b93" },
        { label: "Merge action", value: "3.8 sec" },
        { label: "Verification", value: "Passed in 1.7 sec" },
      ],
    },
    complete: {
      result: "Simple workflow version 4 succeeded",
      summary: "The durable run reached Done after six technical node visits. No failed workflow event or retry was observed for this run.",
      facts: [
        { label: "Run", value: "Sequence 3 · Simple v4" },
        { label: "Visits", value: "6" },
        { label: "Duration", value: "6 min 44 sec" },
        { label: "Finished", value: "25 Aug 2026 · 09:55:23 UTC" },
      ],
    },
  },
  pullRequest: {
    label: "PR #1",
    title: "SAC-130: OpenSpec plan",
    status: "Merged",
    url: "https://github.com/sachinkundu/deos-sample-project/pull/1",
    branch: "deos/planning/1f4edc54506d5719752da488",
    commit: "cd374edc02b5097f0596df6c4731da84803912de",
    mergeCommit: "9270b93d31c653f15714509a8f841d98a13c6e46",
  },
  linear: {
    label: "SAC-130",
    title: "Add Microsoft Entra login",
    url: "https://linear.app/sachinkundu/issue/SAC-130/add-microsoft-entra-login",
  },
  agentRuns: {
    planning: [
      {
        label: "Planning Agent · Run 1",
        outcome: "Completed",
        summary: "Created and published the valid OpenSpec proposal and complete delta specification for SAC-130.",
        facts: [
          { label: "Duration", value: "5 min 16 sec" },
          { label: "Transcript", value: "46 recorded events" },
          { label: "Agent updates", value: "5" },
          { label: "Artifacts", value: "5 accepted" },
        ],
        notes: [
          "The named change did not exist, so the agent scaffolded only sac-130.",
          "It created the proposal and the entra-login delta specification.",
          "Strict OpenSpec validation passed.",
          "Proposal readability passed at 83.83; the specification passed at 88.49.",
          "The final provider operation published PR #1 successfully.",
        ],
        source: {
          label: "Open full transcript",
          format: "JSONL",
          eventCount: 46,
          byteSize: 44634,
          sha256: "67fc1d6a7c52b49eca2cccf9dc29d2f4bb47fd94bdee41f33e565133fb85bd58",
          attemptId: "01a03852-9204-7612-bbb6-b76579f1462a",
        },
      },
    ],
  },
  cycles: {},
  runs: { planning: 1 },
  primaryAction: "View planning result",
  evidence: {
    recordedAt: "2026-08-26T08:15:02Z",
    correlationId: "workflow:99426d9b-cda7-4db4-9136-692a95a0b090:8009635e-3567-4dd7-83de-5d9e8274a165",
    runId: "workflow:99426d9b-cda7-4db4-9136-692a95a0b090:8009635e-3567-4dd7-83de-5d9e8274a165:run:3",
    attemptId: "01a03852-9204-7612-bbb6-b76579f1462a",
    artifactManifestDigest: "711d885c520de2241d76d122ebec9a38179d0d018e3423d9dec5bdec77425ff5",
    transcriptDigest: "67fc1d6a7c52b49eca2cccf9dc29d2f4bb47fd94bdee41f33e565133fb85bd58",
    sources: ["Linear issue and state history", "workflow telemetry", "durable workflow records", "accepted artifact manifest", "agent transcript", "GitHub pull request"],
    knownGap: "The historical governed work-link row is absent; PR #1 was reconciled from the accepted result, Linear attachment, and GitHub read-back.",
  },
});
