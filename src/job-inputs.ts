import type { OrchestrationRunRecord } from "./orchestration-store.ts";
import type { WorkflowJob } from "./workflow-definition.ts";
import { D1PlanningStore, type RunWorkProductRecord } from "./planning-store.ts";
import { D1DesignStore, type DesignWorkProductRecord } from "./design-store.ts";
import { DESIGN_CANDIDATE_CONTEXT_LIMIT } from "./design-candidate.ts";
import { sha256Hex } from "./trace-review.ts";

interface LinearIssueContext {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  url: string;
  state: { id: string; name: string };
  project: { id: string; name: string } | null;
  comments: { nodes: Array<{ id: string; body: string; updatedAt: string }> };
}

interface PriorAttemptRow {
  node_id: string;
  attempt_id: string;
  result_class: string | null;
  result_detail: string | null;
  manifest_id: string;
  r2_key: string;
  completed_at: string;
}

interface ContinuationPatchRow {
  attempt_id: string;
  manifest_id: string;
  r2_key: string;
  sha256: string;
}

export interface ContinuationPatchReference {
  attemptId: string;
  manifestId: string;
  r2Key: string;
  sha256: string;
}

export interface MaterializedJobInput {
  context: string;
  repository: string;
  openspecChange: string;
  continuationPatch: ContinuationPatchReference | null;
  planningWorkProduct: RunWorkProductRecord | null;
  designWorkProduct: DesignWorkProductRecord | null;
  checkoutCommit: string | null;
}

interface JobInputDependencies {
  fetch: typeof fetch;
  now: () => Date;
  readGitHubReviewFeedback: (
    repository: string,
    pullRequestNumber: number,
    installationId: string,
  ) => Promise<readonly Record<string, unknown>[]>;
  readGitHubFile: (
    repository: string,
    path: string,
    ref: string,
    installationId: string,
  ) => Promise<string>;
  readGitHubGuidance: (
    repository: string,
    ref: string,
    installationId: string,
  ) => Promise<readonly { path: string; content: string }[]>;
}

const bounded = (value: string, maximum: number): string =>
  value.length <= maximum ? value : `${value.slice(0, maximum)}\n[truncated by trusted input materializer]`;

const asObject = (value: unknown): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("prior agent result is not an object");
  }
  return value as Record<string, unknown>;
};

type ReviewFeedbackEntry = Record<string, unknown> & {
  kind?: unknown;
  id?: unknown;
  body?: unknown;
  authorType?: unknown;
  trustedAcknowledgmentAuthor?: unknown;
  replyToId?: unknown;
};

export const selectReviewFeedback = (
  entries: readonly ReviewFeedbackEntry[],
  limit = 50,
): readonly ReviewFeedbackEntry[] => {
  const comments = entries.filter((entry) => entry.kind === "review_comment" && Number.isSafeInteger(entry.id));
  const roots = comments.filter((entry) => entry.replyToId === null && entry.authorType === "User");
  const outstandingRootIds = new Set(roots.filter((root) => {
    const rootId = Number(root.id);
    const thread = comments.filter((entry) => entry.id === rootId || entry.replyToId === rootId);
    const lastHumanId = Math.max(...thread
      .filter((entry) => entry.authorType === "User")
      .map((entry) => Number(entry.id)));
    const lastAcknowledgmentId = Math.max(0, ...thread
      .filter((entry) => entry.authorType === "Bot" && entry.trustedAcknowledgmentAuthor === true &&
        typeof entry.body === "string" &&
        entry.body.includes("<!-- deos-review-reply:") && entry.body.includes(`:${rootId} -->`))
      .map((entry) => Number(entry.id)));
    return lastAcknowledgmentId < lastHumanId;
  }).map((entry) => Number(entry.id)));
  const required = entries.filter((entry) =>
    outstandingRootIds.has(Number(entry.id)) || outstandingRootIds.has(Number(entry.replyToId))
  );
  if (required.length > limit) throw new Error("GitHub review feedback exceeds the trusted thread limit");
  const requiredSet = new Set(required);
  const remaining = entries.filter((entry) => !requiredSet.has(entry));
  const selected = new Set([...required, ...remaining.slice(-(limit - required.length))]);
  return Object.freeze(entries.filter((entry) => selected.has(entry)));
};

interface PriorDesignCandidateIdentity {
  candidate_id: string;
  run_id: string;
  round: number;
  source_attempt_id: string;
  base_commit: string;
  change_id: string;
  design_digest: string;
  candidate_digest: string;
  candidate_sha256: string;
}

export const verifyPriorDesignCandidate = async (
  text: string,
  row: PriorDesignCandidateIdentity,
): Promise<Record<string, unknown>> => {
  if (new TextEncoder().encode(text).byteLength > DESIGN_CANDIDATE_CONTEXT_LIMIT) {
    throw new Error("prior design candidate exceeds the trusted limit");
  }
  if (await sha256Hex(text) !== row.candidate_sha256) {
    throw new Error("prior design candidate hash mismatch");
  }
  const candidate = asObject(JSON.parse(text));
  if (
    candidate.version !== 1 || candidate.candidateId !== row.candidate_id ||
    candidate.runId !== row.run_id || candidate.round !== row.round ||
    candidate.sourceAttemptId !== row.source_attempt_id || candidate.baseCommit !== row.base_commit ||
    candidate.change !== row.change_id || candidate.designDigest !== row.design_digest ||
    candidate.candidateDigest !== row.candidate_digest ||
    candidate.path !== `openspec/changes/${row.change_id}/design.md`
  ) throw new Error("prior design candidate identity mismatch");
  return candidate;
};

export const openSpecChangeIdentity = (identifier: string): string => {
  const change = identifier.toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(change)) {
    throw new Error("Linear issue identifier cannot form an OpenSpec change identity");
  }
  return change;
};

export class JobInputMaterializer {
  private readonly database: D1Database;
  private readonly artifacts: R2Bucket;
  private readonly linearApiUrl: string;
  private readonly linearAccessToken: string;
  private readonly request: typeof fetch;
  private readonly now: () => Date;
  private readonly readGitHubReviewFeedback: JobInputDependencies["readGitHubReviewFeedback"];
  private readonly readGitHubFile: JobInputDependencies["readGitHubFile"];
  private readonly readGitHubGuidance: JobInputDependencies["readGitHubGuidance"];

  constructor(
    database: D1Database,
    artifacts: R2Bucket,
    linearApiUrl: string,
    linearAccessToken: string,
    dependencies: Partial<JobInputDependencies> = {},
  ) {
    this.database = database;
    this.artifacts = artifacts;
    this.linearApiUrl = linearApiUrl;
    this.linearAccessToken = linearAccessToken;
    this.request = dependencies.fetch ?? ((input, init) => fetch(input, init));
    this.now = dependencies.now ?? (() => new Date());
    this.readGitHubReviewFeedback = dependencies.readGitHubReviewFeedback ?? (async () => []);
    this.readGitHubFile = dependencies.readGitHubFile ?? (async () => {
      throw new Error("trusted GitHub file reader is unavailable");
    });
    this.readGitHubGuidance = dependencies.readGitHubGuidance ?? (async () => []);
  }

  async materialize(run: OrchestrationRunRecord, job: WorkflowJob): Promise<MaterializedJobInput> {
    const issue = await this.linearIssue(run.issue_id);
    if (issue.project?.id !== run.project_id) {
      throw new Error("Linear issue project does not match the workflow run");
    }
    const priorAttempts = await this.priorAttempts(run.run_id);
    const openspecChange = openSpecChangeIdentity(issue.identifier);
    const designAuthor = job.inputs.includes("design_context");
    const continuationPatch = designAuthor
      ? await this.designContinuationPatch(run.run_id)
      : await this.continuationPatch(run.run_id);
    const planningAuthor = !designAuthor && (
      job.capabilities?.includes("github.publish_planning_work_product") === true ||
      (job.agentRole === "author" && job.inputs.includes("openspec_change"))
    );
    const planningParticipant = designAuthor || planningAuthor || job.agentRole === "reviewer" ||
      job.context.includes("planning_pull_request") || job.inputs.includes("traceability_feedback");
    const planningWorkProduct = planningAuthor
      ? await this.allocatePlanningWorkProduct(run, openspecChange)
      : planningParticipant ? await new D1PlanningStore(this.database).findRunWorkProduct(run.run_id) : null;
    const frozenRepository = run.route_repository;
    const frozenInstallationId = run.route_github_installation_id;
    if (frozenRepository === null || frozenRepository === undefined) {
      throw new Error("job frozen repository is missing");
    }
    if (frozenInstallationId === null || frozenInstallationId === undefined) {
      throw new Error("job frozen GitHub App installation is missing");
    }
    if (planningWorkProduct !== null && planningWorkProduct.repository !== frozenRepository) {
      throw new Error("planning work product does not match the frozen route");
    }
    let designWorkProduct: DesignWorkProductRecord | null = null;
    if (designAuthor) {
      if (
        planningWorkProduct === null || planningWorkProduct.merge_commit_sha === null ||
        planningWorkProduct.verified_merge_commit_sha !== planningWorkProduct.merge_commit_sha ||
        planningWorkProduct.verification_operation_id === null
      ) throw new Error("checked planning merge is required for design allocation");
      designWorkProduct = await new D1DesignStore(this.database).allocate({
        runId: run.run_id,
        repository: frozenRepository,
        baseCommit: planningWorkProduct.merge_commit_sha,
        changeId: openspecChange,
        now: this.now().toISOString(),
      });
    }
    const feedbackWorkProduct = designAuthor ? designWorkProduct : planningWorkProduct;
    const githubFeedback = feedbackWorkProduct?.pull_request_number === null ||
        feedbackWorkProduct?.pull_request_number === undefined
      ? []
      : selectReviewFeedback(await this.readGitHubReviewFeedback(
          feedbackWorkProduct.repository,
          feedbackWorkProduct.pull_request_number,
          frozenInstallationId,
        ));
    const approvedPlan = designAuthor
      ? await this.approvedPlan(planningWorkProduct!, frozenInstallationId)
      : null;
    const repositoryGuidance = designAuthor
      ? await this.readGitHubGuidance(frozenRepository, designWorkProduct!.base_commit, frozenInstallationId)
      : [];
    const priorDesign = designAuthor ? await this.priorDesign(run.run_id) : null;
    const bundle = {
      version: 1,
      declaredInputs: job.inputs,
      declaredContext: job.context,
      linearIssue: {
        id: issue.id,
        identifier: issue.identifier,
        title: bounded(issue.title, 500),
        description: issue.description === null ? null : bounded(issue.description, 20_000),
        url: issue.url,
        state: issue.state,
        project: issue.project,
      },
      sharedWorkingNotes: issue.comments.nodes
        .filter((comment) => comment.body.includes("<!-- deos-operation:"))
        .slice(-20)
        .map((comment) => ({
          id: comment.id,
          body: bounded(comment.body, 4_000),
          updatedAt: comment.updatedAt,
        })),
      priorAttempts,
      openspec: job.operation?.kind === "openspec"
        ? { change: openspecChange, instruction: job.operation.instruction }
        : planningParticipant
          ? { change: openspecChange, instruction: null }
          : null,
      planning: planningWorkProduct === null ? null : {
        branch: planningWorkProduct.remote_branch,
        baseBranch: planningWorkProduct.base_branch,
        pullRequest: planningWorkProduct.pull_request_number === null ? null : {
          databaseId: planningWorkProduct.pull_request_database_id,
          number: planningWorkProduct.pull_request_number,
          url: planningWorkProduct.pull_request_url,
          headSha: planningWorkProduct.head_sha,
          manifestDigest: planningWorkProduct.planning_manifest_digest,
        },
        feedback: {
          linearComments: issue.comments.nodes
            .filter((comment) => !comment.body.includes("<!-- deos-operation:"))
            .slice(-20)
            .map((comment) => ({
              id: comment.id,
              body: bounded(comment.body, 4_000),
              updatedAt: comment.updatedAt,
            })),
          github: githubFeedback.map((entry) => ({
            data: bounded(JSON.stringify(entry), 4_000),
          })),
        },
      },
      design: designWorkProduct === null ? null : {
        baseCommit: designWorkProduct.base_commit,
        branch: designWorkProduct.remote_branch,
        pullRequest: designWorkProduct.pull_request_number === null ? null : {
          databaseId: designWorkProduct.pull_request_database_id,
          number: designWorkProduct.pull_request_number,
          url: designWorkProduct.pull_request_url,
          headSha: designWorkProduct.head_sha,
        },
        approvedPlan,
        priorDesign,
        guidance: {
          files: repositoryGuidance.map((file) => ({
            path: file.path,
            content: file.content,
          })),
          missingOptionalFilesAreNotInvented: true,
        },
        feedback: githubFeedback.map((entry) => ({
          data: bounded(JSON.stringify(entry), 4_000),
        })),
      },
      repository: {
        checkout: "/deos/workspace/repository",
        branch: "deos/{attemptId}",
        planningBranch: planningWorkProduct?.remote_branch ?? null,
        continuationPatch,
      },
      traceabilityFeedback: job.inputs.includes("traceability_feedback")
        ? await this.traceabilityFeedback(run.run_id)
        : null,
    };
    const encoded = JSON.stringify(bundle);
    if (encoded.length > 128_000) throw new Error("materialized job inputs exceed the trusted limit");
    return {
      context: encoded,
      repository: frozenRepository,
      openspecChange,
      continuationPatch,
      planningWorkProduct,
      designWorkProduct,
      checkoutCommit: designWorkProduct?.base_commit ?? null,
    };
  }

  private async approvedPlan(
    planning: RunWorkProductRecord,
    installationId: string,
  ): Promise<readonly { path: string; content: string; sha256: string; byteSize: number }[]> {
    if (planning.merge_commit_sha === null || planning.planning_manifest_json === null) {
      throw new Error("approved planning manifest is missing");
    }
    const manifest = JSON.parse(planning.planning_manifest_json) as Array<{
      path: string;
      sha256: string;
      byteSize: number;
    }>;
    if (!Array.isArray(manifest) || manifest.length < 3 || manifest.length > 48) {
      throw new Error("approved planning manifest is invalid");
    }
    const files = await Promise.all(manifest.map(async (entry) => ({
      ...entry,
      content: await this.readGitHubFile(
        planning.repository,
        entry.path,
        planning.merge_commit_sha!,
        installationId,
      ),
    })));
    if (files.reduce((sum, file) => sum + new TextEncoder().encode(file.content).byteLength, 0) > 96_000) {
      throw new Error("approved plan context exceeds the trusted limit");
    }
    return Object.freeze(files.map((file) => Object.freeze(file)));
  }

  private async priorDesign(runId: string): Promise<Record<string, unknown> | null> {
    const row = await this.database.prepare(
      `SELECT candidate_id, run_id, round, source_attempt_id, base_commit, change_id,
              design_digest, candidate_digest, candidate_r2_key, candidate_sha256
       FROM design_candidates
       WHERE run_id = ? AND state = 'validated'
       ORDER BY round DESC, created_at DESC, candidate_id DESC LIMIT 1`,
    ).bind(runId).first<PriorDesignCandidateIdentity & { candidate_r2_key: string }>();
    if (row === null) return null;
    const object = await this.artifacts.get(row.candidate_r2_key);
    if (object === null) throw new Error("prior design candidate is missing");
    return verifyPriorDesignCandidate(await object.text(), row);
  }

  private async traceabilityFeedback(runId: string): Promise<Record<string, unknown> | null> {
    const row = await this.database.prepare(
      `SELECT r.review_id, r.phase, r.mode, r.round, r.review_input_id,
              r.baseline_finding_set_digest, r.overall_outcome,
              sidecar.r2_key AS sidecar_r2_key, sidecar.sha256 AS sidecar_sha256,
              inventory.r2_key AS inventory_r2_key, inventory.sha256 AS inventory_sha256
       FROM trace_reviews r
       JOIN artifacts sidecar
         ON sidecar.manifest_id = r.proof_manifest_id
        AND sidecar.logical_name = 'bettaview-traceability.json'
       JOIN artifacts inventory
         ON inventory.manifest_id = r.proof_manifest_id
        AND inventory.logical_name = 'candidate-inventory.json'
       WHERE r.run_id = ? AND r.accepted = 1
       ORDER BY r.completed_at DESC, r.review_id DESC LIMIT 1`,
    ).bind(runId).first<{
      review_id: string;
      phase: string;
      mode: string;
      round: number;
      review_input_id: string;
      baseline_finding_set_digest: string | null;
      overall_outcome: string;
      sidecar_r2_key: string;
      sidecar_sha256: string;
      inventory_r2_key: string;
      inventory_sha256: string;
    }>();
    if (row === null) return null;
    const [sidecar, inventory] = await Promise.all([
      this.artifacts.get(row.sidecar_r2_key),
      this.artifacts.get(row.inventory_r2_key),
    ]);
    if (sidecar === null || inventory === null) throw new Error("traceability feedback artifacts are missing");
    const [sidecarText, inventoryText] = await Promise.all([sidecar.text(), inventory.text()]);
    if (sidecarText.length + inventoryText.length > 96_000) {
      throw new Error("traceability feedback exceeds the trusted limit");
    }
    return {
      reviewId: row.review_id,
      phase: row.phase,
      mode: row.mode,
      round: row.round,
      reviewInputId: row.review_input_id,
      baselineFindingSetDigest: row.baseline_finding_set_digest,
      overallOutcome: row.overall_outcome,
      sidecarSha256: row.sidecar_sha256,
      inventorySha256: row.inventory_sha256,
      sidecar: asObject(JSON.parse(sidecarText)),
      inventory: asObject(JSON.parse(inventoryText)),
    };
  }

  private async allocatePlanningWorkProduct(
    run: OrchestrationRunRecord,
    changeId: string,
  ): Promise<RunWorkProductRecord> {
    if (run.route_repository === null || run.route_repository === undefined) {
      throw new Error("planning frozen repository is missing");
    }
    return new D1PlanningStore(this.database).allocateRunWorkProduct({
      runId: run.run_id,
      repository: run.route_repository,
      changeId,
      now: this.now().toISOString(),
    });
  }

  private async linearIssue(issueId: string): Promise<LinearIssueContext> {
    const response = await this.request(this.linearApiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.linearAccessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: `query DeosJobIssue($id: String!) {
          issue(id: $id) {
            id identifier title description url
            state { id name }
            project { id name }
            comments { nodes { id body updatedAt } }
          }
        }`,
        variables: { id: issueId },
      }),
    });
    if (!response.ok) throw new Error("Linear job input request failed");
    const payload = await response.json() as {
      data?: { issue?: LinearIssueContext | null };
      errors?: unknown[];
    };
    if (payload.errors?.length || payload.data?.issue === null || payload.data?.issue === undefined) {
      throw new Error("Linear job input GraphQL response is invalid");
    }
    return payload.data.issue;
  }

  private async priorAttempts(runId: string): Promise<Array<Record<string, unknown>>> {
    const result = await this.database.prepare(
      `SELECT a.node_id, a.attempt_id, a.result_class, a.result_detail, a.manifest_id,
              m.r2_key, m.completed_at
       FROM agent_attempts a
       JOIN artifact_manifests m ON m.manifest_id = a.manifest_id
       WHERE a.run_id = ? AND m.state = 'complete'
       ORDER BY m.completed_at ASC, a.attempt_id ASC
       LIMIT 20`,
    ).bind(runId).all<PriorAttemptRow>();
    const attempts: Array<Record<string, unknown>> = [];
    for (const row of result.results) {
      const resultKey = row.r2_key.replace(/\/manifest\.json$/, "/result.json");
      const object = await this.artifacts.get(resultKey);
      if (object === null) throw new Error("prior agent result artifact is missing");
      const text = await object.text();
      if (text.length > 20_000) throw new Error("prior agent result exceeds the trusted limit");
      attempts.push({
        nodeId: row.node_id,
        attemptId: row.attempt_id,
        outcome: row.result_class,
        trustedResultDetail: row.result_detail,
        manifestId: row.manifest_id,
        completedAt: row.completed_at,
        result: asObject(JSON.parse(text)),
      });
    }
    return attempts;
  }

  private continuationPatch(runId: string): Promise<ContinuationPatchReference | null> {
    return this.database.prepare(
      `SELECT a.attempt_id, m.manifest_id, f.r2_key, f.sha256
       FROM agent_attempts a
       JOIN artifact_manifests m ON m.manifest_id = a.manifest_id
       JOIN artifacts f ON f.manifest_id = m.manifest_id AND f.logical_name = 'patch.diff'
       WHERE a.run_id = ? AND a.state = 'completed' AND m.state = 'complete'
         AND COALESCE(json_extract(a.job_spec_json, '$.agentRole'), 'author') <> 'reviewer'
       ORDER BY m.completed_at DESC, a.attempt_id DESC
       LIMIT 1`,
    ).bind(runId).first<ContinuationPatchRow>().then((row) => row === null ? null : ({
      attemptId: row.attempt_id,
      manifestId: row.manifest_id,
      r2Key: row.r2_key,
      sha256: row.sha256,
    }));
  }

  private designContinuationPatch(runId: string): Promise<ContinuationPatchReference | null> {
    return this.database.prepare(
      `SELECT a.attempt_id, m.manifest_id, f.r2_key, f.sha256
       FROM agent_attempts a
       JOIN artifact_manifests m ON m.manifest_id = a.manifest_id
       JOIN artifacts f ON f.manifest_id = m.manifest_id AND f.logical_name = 'patch.diff'
       WHERE a.run_id = ? AND a.node_id IN ('design_author', 'design_revision_author')
         AND a.state = 'completed' AND m.state = 'complete'
       ORDER BY m.completed_at DESC, a.attempt_id DESC LIMIT 1`,
    ).bind(runId).first<ContinuationPatchRow>().then((row) => row === null ? null : ({
      attemptId: row.attempt_id,
      manifestId: row.manifest_id,
      r2Key: row.r2_key,
      sha256: row.sha256,
    }));
  }
}
