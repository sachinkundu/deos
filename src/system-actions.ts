import type { OrchestrationRunRecord } from "./orchestration-store.ts";
import type { ValidatedSystemOutcome } from "./workflow-evaluator.ts";
import type { GitHubCapabilityAdapter } from "./github-capability.ts";
import { operationIdentity } from "./orchestration-identity.ts";
import type { ProviderOperationRecord, ProviderOperationState } from "./linear-transition.ts";
import type { D1PlanningStore, RunWorkProductRecord } from "./planning-store.ts";
import type { D1DesignStore, DesignWorkProductRecord } from "./design-store.ts";
import type { HumanGateVisitRecord } from "./human-gate-store.ts";

export interface SystemActionStore {
  prerequisites(runId: string, action: string): Promise<{
    incompleteOperations: number;
    actionReceipts: number;
  }>;
  beginPlanningOperation?(input: {
    operationId: string;
    runId: string;
    action: string;
    requestDigest: string;
    now: string;
  }): Promise<ProviderOperationRecord>;
  finishPlanningOperation?(input: {
    operationId: string;
    expected: ProviderOperationState;
    state: ProviderOperationState;
    providerResourceId: string | null;
    safeErrorCategory: string | null;
    now: string;
  }): Promise<boolean>;
}

const changes = (result: D1Result<unknown>): number => result.meta.changes ?? 0;

const sha256Hex = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const shaPattern = /^[0-9a-f]{40}$/;

const savedPlanningVerificationMatches = async (
  workProduct: RunWorkProductRecord,
): Promise<boolean> => {
  if (
    workProduct.pull_request_database_id === null || workProduct.pull_request_number === null ||
    workProduct.head_sha === null || workProduct.merge_commit_sha === null ||
    workProduct.planning_manifest_json === null || workProduct.verification_manifest_json === null ||
    workProduct.verification_manifest_digest === null ||
    workProduct.verified_merge_commit_sha !== workProduct.merge_commit_sha ||
    await sha256Hex(workProduct.verification_manifest_json) !== workProduct.verification_manifest_digest
  ) return false;
  try {
    const receipt = JSON.parse(workProduct.verification_manifest_json) as Record<string, unknown>;
    return receipt.pullRequestDatabaseId === workProduct.pull_request_database_id &&
      receipt.pullRequestNumber === workProduct.pull_request_number &&
      receipt.approvedHeadSha === workProduct.head_sha &&
      receipt.mergeCommitSha === workProduct.merge_commit_sha &&
      typeof receipt.defaultHeadSha === "string" && shaPattern.test(receipt.defaultHeadSha) &&
      JSON.stringify(receipt.files) === workProduct.planning_manifest_json;
  } catch {
    return false;
  }
};

export class D1SystemActionStore implements SystemActionStore {
  private readonly database: D1Database;

  constructor(database: D1Database) {
    this.database = database;
  }

  async prerequisites(runId: string, action: string): Promise<{
    incompleteOperations: number;
    actionReceipts: number;
  }> {
    const row = await this.database.prepare(
      `SELECT
         (SELECT COUNT(*) FROM provider_operations
          WHERE run_id = ? AND state IN ('pending', 'failed', 'manual_reconciliation_required')) AS incompleteOperations,
         (SELECT COUNT(*) FROM provider_operations
          WHERE run_id = ? AND capability = 'system_action' AND action = ?
            AND state IN ('succeeded', 'reconciled')) AS actionReceipts`,
    ).bind(runId, runId, action).first<{
      incompleteOperations: number;
      actionReceipts: number;
    }>();
    return row ?? { incompleteOperations: 1, actionReceipts: 0 };
  }

  async beginPlanningOperation(input: {
    operationId: string;
    runId: string;
    action: string;
    requestDigest: string;
    now: string;
  }): Promise<ProviderOperationRecord> {
    await this.database.prepare(
      `INSERT OR IGNORE INTO provider_operations
       (operation_id, run_id, attempt_id, capability, action, sanitized_target,
        request_digest, state, started_at, updated_at)
       VALUES (?, ?, NULL, 'system_action', ?, 'recorded-planning-pull-request', ?, 'pending', ?, ?)`,
    ).bind(
      input.operationId,
      input.runId,
      input.action,
      input.requestDigest,
      input.now,
      input.now,
    ).run();
    const operation = await this.database.prepare(
      "SELECT * FROM provider_operations WHERE operation_id = ?",
    ).bind(input.operationId).first<ProviderOperationRecord>();
    if (
      operation === null || operation.run_id !== input.runId ||
      operation.action !== input.action || operation.request_digest !== input.requestDigest
    ) throw new Error("planning system-action operation identity mismatch");
    return operation;
  }

  async finishPlanningOperation(input: {
    operationId: string;
    expected: ProviderOperationState;
    state: ProviderOperationState;
    providerResourceId: string | null;
    safeErrorCategory: string | null;
    now: string;
  }): Promise<boolean> {
    const result = await this.database.prepare(
      `UPDATE provider_operations
       SET state = ?, provider_resource_id = ?, safe_error_category = ?,
           updated_at = ?, completed_at = ?
       WHERE operation_id = ? AND state = ?`,
    ).bind(
      input.state,
      input.providerResourceId,
      input.safeErrorCategory,
      input.now,
      input.now,
      input.operationId,
      input.expected,
    ).run();
    return changes(result) === 1;
  }
}

interface PlanningSystemActionDependencies {
  github: Pick<
    GitHubCapabilityAdapter,
    "mergePlanning" | "readPullRequest" | "verifyCommitOnBranch" | "readFileAtRef"
  > & Partial<Pick<GitHubCapabilityAdapter, "publishPlanning" | "publishDesign" | "mergeDesign">>;
  githubForRun?: (run: OrchestrationRunRecord) => Pick<
    GitHubCapabilityAdapter,
    "mergePlanning" | "readPullRequest" | "verifyCommitOnBranch" | "readFileAtRef"
  > & Partial<Pick<GitHubCapabilityAdapter, "publishPlanning" | "publishDesign" | "mergeDesign">>;
  planningStore: Pick<
    D1PlanningStore,
    "findRunWorkProduct" | "recordMerge" | "recordVerification"
  > & Partial<Pick<D1PlanningStore, "recordPublication">>;
  planningCandidate?: (runId: string) => Promise<{
    candidateId: string;
    candidateDigest: string;
    change: string;
    files: readonly { path: string; content: string; sha256: string; byteSize: number }[];
    reviewReplies: readonly { commentId: number; body: string }[];
    reviewDispositions: readonly {
      itemId: string;
      status: "applied" | "declined" | "no_change";
      reason: string;
    }[];
    reviewContextId: string | null;
  } | null>;
  issueContext?: (runId: string) => Promise<{
    identifier: string;
    url: string;
  } | null>;
  designStore?: Pick<D1DesignStore, "findWorkProduct" | "recordPublication" | "recordMerge">;
  designCandidate?: (runId: string) => Promise<{
    candidateId: string;
    candidateDigest: string;
    change: string;
    baseCommit: string;
    path: string;
    content: string;
    designDigest: string;
    reviewReplies: readonly { commentId: number; body: string }[];
  } | null>;
  gateVisit?: (runId: string, gateKind: "plan" | "design") => Promise<HumanGateVisitRecord | null>;
  planningMergeRepairNotice?: (
    run: OrchestrationRunRecord,
    verificationOperationId: string,
  ) => Promise<void>;
  now?: () => Date;
}

export class SystemActionController {
  private readonly store: SystemActionStore;
  private readonly planning?: PlanningSystemActionDependencies;
  private readonly now: () => Date;

  constructor(store: SystemActionStore, planning?: PlanningSystemActionDependencies) {
    this.store = store;
    this.planning = planning;
    this.now = planning?.now ?? (() => new Date());
  }

  async execute(
    run: OrchestrationRunRecord,
    nodeId: string,
    action: string,
  ): Promise<ValidatedSystemOutcome> {
    if (action === "github.merge_planning_pull_request") {
      return this.mergePlanning(run, nodeId, action);
    }
    if (action === "github.publish_planning_candidate") {
      return this.publishPlanning(run, nodeId, action);
    }
    if (action === "github.verify_planning_merge") {
      return this.verifyPlanningMerge(run, nodeId, action);
    }
    if (action === "github.publish_design_candidate") {
      return this.publishDesign(run, nodeId, action);
    }
    if (action === "github.merge_design_pull_request") {
      return this.mergeDesign(run, nodeId, action);
    }
    if (action === "design.start_new_round") {
      return this.startDesignRound(run, nodeId, action);
    }
    const prerequisites = await this.store.prerequisites(run.run_id, action);
    const completed = prerequisites.incompleteOperations === 0 && prerequisites.actionReceipts > 0;
    return {
      kind: "system_action",
      outcome: completed ? "completed" : "failed",
      providerReceiptsComplete: completed,
    };
  }

  private async publishPlanning(
    run: OrchestrationRunRecord,
    nodeId: string,
    action: string,
  ): Promise<ValidatedSystemOutcome> {
    const dependencies = this.requirePlanningDependencies(run);
    if (
      this.planning?.planningCandidate === undefined || this.planning.issueContext === undefined ||
      dependencies.github.publishPlanning === undefined ||
      dependencies.planningStore.recordPublication === undefined
    ) {
      throw new Error("trusted planning publication dependencies are unavailable");
    }
    const [workProduct, candidate, issue] = await Promise.all([
      dependencies.planningStore.findRunWorkProduct(run.run_id),
      this.planning.planningCandidate(run.run_id),
      this.planning.issueContext(run.run_id),
    ]);
    if (workProduct === null || candidate === null || issue === null) return this.failed();
    if (
      candidate.change !== workProduct.change_id || candidate.files.length < 3 ||
      candidate.files.some((file) => !file.path.startsWith(`openspec/changes/${candidate.change}/`))
    ) return this.failed();
    const manifestJson = JSON.stringify(candidate.files.map(({ content: _content, ...file }) => file));
    const manifestDigest = await sha256Hex(manifestJson);
    const operationId = operationIdentity(
      run.run_id,
      "system_action",
      `${nodeId}:${action}:${candidate.candidateDigest}`,
      run.current_visit_sequence,
    );
    const operation = await this.beginPlanningOperation(
      operationId,
      run.run_id,
      action,
      await sha256Hex(JSON.stringify({
        candidateId: candidate.candidateId,
        candidateDigest: candidate.candidateDigest,
        repository: workProduct.repository,
        branch: workProduct.remote_branch,
        manifestDigest,
      })),
    );
    if (["succeeded", "reconciled"].includes(operation.state) && workProduct.head_sha !== null) {
      return this.completed();
    }
    if (!["pending", "manual_reconciliation_required"].includes(operation.state)) return this.failed();
    const specPaths = candidate.files
      .map((file) => file.path.slice(`openspec/changes/${candidate.change}/`.length))
      .filter((path) => path.startsWith("specs/"));
    const dispositionCounts = candidate.reviewDispositions.reduce((counts, disposition) => ({
      ...counts,
      [disposition.status]: counts[disposition.status] + 1,
    }), { applied: 0, declined: 0, no_change: 0 });
    const reviewNotes = [
      "- Review the proposal and complete delta specs together.",
      ...(candidate.reviewDispositions.length === 0 ? [] : [
        `- Independent review response: ${dispositionCounts.applied} applied, ${dispositionCounts.declined} declined, and ${dispositionCounts.no_change} needed no text change; use the DEOS trace for each concern and reason.`,
      ]),
    ];
    const body = [
      `Linear: [${issue.identifier}](${issue.url})`,
      `OpenSpec change: ${candidate.change}`,
      "",
      "## Review notes",
      ...reviewNotes,
      "",
      "## Review order",
      "1. proposal.md",
      `2. Specs: ${specPaths.join(", ")}`,
      "",
      "## Validation",
      `- openspec validate ${candidate.change} --strict — passed`,
      "- Trusted candidate readability check — passed",
    ].join("\n");
    try {
      const receipt = await dependencies.github.publishPlanning({
        repository: workProduct.repository,
        branch: workProduct.remote_branch,
        baseBranch: "main",
        change: candidate.change,
        title: `${issue.identifier}: OpenSpec plan`,
        body,
        files: candidate.files.map(({ path, content }) => ({ path, content })),
        reviewReplies: candidate.reviewReplies,
        ...(workProduct.pull_request_database_id === null ? {} : {
          expectedPullRequestDatabaseId: workProduct.pull_request_database_id,
          expectedPullRequestNumber: workProduct.pull_request_number ?? undefined,
        }),
      }, operationId);
      const state = receipt.reconciled || operation.state !== "pending" ? "reconciled" : "succeeded";
      if (operation.state !== state) {
        const finished = await this.finishPlanningOperation({
          operationId,
          expected: operation.state,
          state,
          providerResourceId: receipt.pullRequestDatabaseId,
          safeErrorCategory: null,
          now: this.now().toISOString(),
        });
        if (!finished) throw new Error("trusted planning publication receipt compare-and-set failed");
      }
      await dependencies.planningStore.recordPublication({
        runId: run.run_id,
        repository: workProduct.repository,
        remoteBranch: workProduct.remote_branch,
        changeId: candidate.change,
        pullRequestDatabaseId: receipt.pullRequestDatabaseId,
        pullRequestNumber: receipt.pullRequestNumber,
        pullRequestUrl: receipt.pullRequestUrl,
        headSha: receipt.headSha,
        planningManifestDigest: manifestDigest,
        planningManifestJson: manifestJson,
        operationId,
        now: this.now().toISOString(),
      });
      return this.completed();
    } catch (error) {
      const ambiguous = error instanceof Error && /ambiguous|provider request failed/i.test(error.message);
      if (operation.state === "pending") {
        await this.finishPlanningOperation({
          operationId,
          expected: "pending",
          state: ambiguous ? "manual_reconciliation_required" : "failed",
          providerResourceId: workProduct.pull_request_database_id,
          safeErrorCategory: ambiguous ? "planning_publish_unconfirmed" : "planning_publish_rejected",
          now: this.now().toISOString(),
        });
      }
      if (ambiguous) throw new Error("trusted planning publication requires provider reconciliation");
      return this.failed();
    }
  }

  private async mergePlanning(
    run: OrchestrationRunRecord,
    nodeId: string,
    action: string,
  ): Promise<ValidatedSystemOutcome> {
    const dependencies = this.requirePlanningDependencies(run);
    const [workProduct, gate] = await Promise.all([
      dependencies.planningStore.findRunWorkProduct(run.run_id),
      run.definition_version >= 17
        ? this.planning?.gateVisit?.(run.run_id, "plan") ?? Promise.resolve(null)
        : Promise.resolve(null),
    ]);
    if (
      workProduct === null || workProduct.pull_request_database_id === null ||
      workProduct.pull_request_number === null || workProduct.head_sha === null ||
      workProduct.planning_manifest_digest === null ||
      workProduct.latest_publication_operation_id === null
    ) return this.failed();
    if (
      run.definition_version >= 17 && (
        gate === null || gate.state !== "merge_authorized" ||
        gate.pull_request_database_id !== workProduct.pull_request_database_id ||
        gate.pull_request_number !== workProduct.pull_request_number ||
        gate.head_branch !== workProduct.remote_branch || gate.approved_head_sha !== workProduct.head_sha
      )
    ) return this.failed();
    const operationId = operationIdentity(
      run.run_id,
      "system_action",
      `${nodeId}:${action}`,
      run.current_visit_sequence,
    );
    const operation = await this.beginPlanningOperation(
      operationId,
      run.run_id,
      action,
      await sha256Hex(JSON.stringify({
        repository: workProduct.repository,
        number: workProduct.pull_request_number,
        databaseId: workProduct.pull_request_database_id,
        base: workProduct.base_branch,
        head: workProduct.remote_branch,
        sha: workProduct.head_sha,
      })),
    );
    if (["succeeded", "reconciled"].includes(operation.state) && workProduct.merge_commit_sha !== null) {
      return this.completed();
    }
    if (!["pending", "manual_reconciliation_required"].includes(operation.state)) return this.failed();
    try {
      const receipt = await dependencies.github.mergePlanning({
        repository: workProduct.repository,
        pullRequestNumber: workProduct.pull_request_number,
        pullRequestDatabaseId: workProduct.pull_request_database_id,
        baseBranch: "main",
        headBranch: workProduct.remote_branch,
        expectedHeadSha: workProduct.head_sha,
      });
      const state = receipt.reconciled || operation.state !== "pending" ? "reconciled" : "succeeded";
      if (operation.state !== state) {
        const finished = await this.finishPlanningOperation({
          operationId,
          expected: operation.state,
          state,
          providerResourceId: receipt.pullRequestDatabaseId,
          safeErrorCategory: null,
          now: this.now().toISOString(),
        });
        if (!finished) throw new Error("planning merge receipt compare-and-set failed");
      }
      await dependencies.planningStore.recordMerge({
        runId: run.run_id,
        operationId,
        expectedHeadSha: workProduct.head_sha,
        mergeCommitSha: receipt.mergeCommitSha,
        now: this.now().toISOString(),
      });
      return this.completed();
    } catch (error) {
      const ambiguous = error instanceof Error &&
        /ambiguous|provider request failed/i.test(error.message);
      if (operation.state === "pending") {
        await this.finishPlanningOperation({
          operationId,
          expected: "pending",
          state: ambiguous ? "manual_reconciliation_required" : "failed",
          providerResourceId: workProduct.pull_request_database_id,
          safeErrorCategory: ambiguous ? "planning_merge_unconfirmed" : "planning_merge_rejected",
          now: this.now().toISOString(),
        });
      }
      if (ambiguous) throw new Error("planning merge requires provider reconciliation");
      return this.failed();
    }
  }

  private async verifyPlanningMerge(
    run: OrchestrationRunRecord,
    nodeId: string,
    action: string,
  ): Promise<ValidatedSystemOutcome> {
    const dependencies = this.requirePlanningDependencies(run);
    const workProduct = await dependencies.planningStore.findRunWorkProduct(run.run_id);
    if (
      workProduct === null || workProduct.pull_request_database_id === null ||
      workProduct.pull_request_number === null || workProduct.head_sha === null ||
      workProduct.merge_commit_sha === null || workProduct.planning_manifest_json === null ||
      workProduct.planning_manifest_digest === null
    ) return this.failed();
    const operationId = operationIdentity(
      run.run_id,
      "system_action",
      `${nodeId}:${action}:${workProduct.merge_commit_sha}`,
      run.current_visit_sequence,
    );
    const operation = await this.beginPlanningOperation(
      operationId,
      run.run_id,
      action,
      await sha256Hex(JSON.stringify({
        repository: workProduct.repository,
        pullRequestNumber: workProduct.pull_request_number,
        approvedHeadSha: workProduct.head_sha,
        mergeCommitSha: workProduct.merge_commit_sha,
        manifestDigest: workProduct.planning_manifest_digest,
      })),
    );
    if (
      ["succeeded", "reconciled"].includes(operation.state) &&
      workProduct.verified_merge_commit_sha === workProduct.merge_commit_sha
    ) return this.completed();
    if (!["pending", "failed", "manual_reconciliation_required"].includes(operation.state)) {
      return this.failed();
    }
    try {
      if (await savedPlanningVerificationMatches(workProduct)) {
        await dependencies.planningStore.recordVerification({
          runId: run.run_id,
          operationId,
          mergeCommitSha: workProduct.merge_commit_sha,
          verificationManifestJson: workProduct.verification_manifest_json!,
          verificationManifestDigest: workProduct.verification_manifest_digest!,
          now: this.now().toISOString(),
        });
        const finished = await this.finishPlanningOperation({
          operationId,
          expected: operation.state,
          state: "reconciled",
          providerResourceId: workProduct.merge_commit_sha,
          safeErrorCategory: null,
          now: this.now().toISOString(),
        });
        if (!finished) throw new Error("planning verification receipt reconciliation failed");
        return this.completed();
      }
      if (await sha256Hex(workProduct.planning_manifest_json) !== workProduct.planning_manifest_digest) {
        throw new Error("planning manifest digest mismatch");
      }
      const manifest = JSON.parse(workProduct.planning_manifest_json) as Array<{
        path?: unknown;
        sha256?: unknown;
        byteSize?: unknown;
      }>;
      if (!Array.isArray(manifest) || manifest.length < 3 || manifest.length > 48) {
        throw new Error("planning manifest is invalid");
      }
      const pull = await dependencies.github.readPullRequest(
        workProduct.repository,
        workProduct.pull_request_number,
      );
      if (
        pull.databaseId !== workProduct.pull_request_database_id || pull.number !== workProduct.pull_request_number ||
        pull.baseBranch !== workProduct.base_branch || pull.headBranch !== workProduct.remote_branch ||
        pull.headSha !== workProduct.head_sha || !pull.merged ||
        pull.mergeCommitSha !== workProduct.merge_commit_sha
      ) throw new Error("planning merged pull-request identity mismatch");
      const reachable = await dependencies.github.verifyCommitOnBranch(
        workProduct.repository,
        workProduct.merge_commit_sha,
        workProduct.base_branch,
      );
      if (!reachable.reachable) throw new Error("planning merge commit is not on the default branch");
      const checked: Array<{ path: string; sha256: string; byteSize: number }> = [];
      for (const raw of manifest) {
        if (
          typeof raw.path !== "string" || typeof raw.sha256 !== "string" ||
          typeof raw.byteSize !== "number" || !Number.isSafeInteger(raw.byteSize)
        ) throw new Error("planning manifest entry is invalid");
        const content = await dependencies.github.readFileAtRef(
          workProduct.repository,
          raw.path,
          workProduct.merge_commit_sha,
        );
        const digest = await sha256Hex(content);
        const byteSize = new TextEncoder().encode(content).byteLength;
        if (digest !== raw.sha256 || byteSize !== raw.byteSize) {
          throw new Error("planning merge file hash mismatch");
        }
        checked.push({ path: raw.path, sha256: digest, byteSize });
      }
      const verificationManifestJson = JSON.stringify({
        pullRequestDatabaseId: pull.databaseId,
        pullRequestNumber: pull.number,
        approvedHeadSha: workProduct.head_sha,
        mergeCommitSha: workProduct.merge_commit_sha,
        defaultHeadSha: reachable.defaultHeadSha,
        files: checked,
      });
      const verificationManifestDigest = await sha256Hex(verificationManifestJson);
      await dependencies.planningStore.recordVerification({
        runId: run.run_id,
        operationId,
        mergeCommitSha: workProduct.merge_commit_sha,
        verificationManifestJson,
        verificationManifestDigest,
        now: this.now().toISOString(),
      });
      const state = operation.state === "pending" ? "succeeded" : "reconciled";
      if (operation.state !== state) {
        const finished = await this.finishPlanningOperation({
          operationId,
          expected: operation.state,
          state,
          providerResourceId: workProduct.merge_commit_sha,
          safeErrorCategory: null,
          now: this.now().toISOString(),
        });
        if (!finished) throw new Error("planning verification receipt compare-and-set failed");
      }
      return this.completed();
    } catch {
      if (operation.state === "pending") {
        await this.finishPlanningOperation({
          operationId,
          expected: "pending",
          state: "failed",
          providerResourceId: workProduct.merge_commit_sha,
          safeErrorCategory: "planning_merge_files_unproved",
          now: this.now().toISOString(),
        });
      }
      await this.planning?.planningMergeRepairNotice?.(run, operationId);
      return this.failed();
    }
  }

  private async publishDesign(
    run: OrchestrationRunRecord,
    nodeId: string,
    action: string,
  ): Promise<ValidatedSystemOutcome> {
    const dependencies = this.requireDesignDependencies(run);
    if (this.planning?.designCandidate === undefined || this.planning.issueContext === undefined) {
      throw new Error("trusted design publication dependencies are unavailable");
    }
    const [workProduct, candidate, issue] = await Promise.all([
      dependencies.designStore.findWorkProduct(run.run_id),
      this.planning.designCandidate(run.run_id),
      this.planning.issueContext(run.run_id),
    ]);
    if (
      workProduct === null || candidate === null || issue === null ||
      candidate.change !== workProduct.change_id || candidate.baseCommit !== workProduct.base_commit ||
      candidate.path !== `openspec/changes/${workProduct.change_id}/design.md`
    ) return this.failed();
    const operationId = operationIdentity(
      run.run_id,
      "system_action",
      `${nodeId}:${action}:${candidate.candidateDigest}`,
      run.current_visit_sequence,
    );
    const operation = await this.beginPlanningOperation(
      operationId,
      run.run_id,
      action,
      await sha256Hex(JSON.stringify({
        candidateId: candidate.candidateId,
        candidateDigest: candidate.candidateDigest,
        repository: workProduct.repository,
        branch: workProduct.remote_branch,
        baseCommit: workProduct.base_commit,
      })),
    );
    if (["succeeded", "reconciled"].includes(operation.state) && workProduct.head_sha !== null) {
      return this.completed();
    }
    if (!["pending", "manual_reconciliation_required"].includes(operation.state)) return this.failed();
    const expectedOperationState = operation.state === "pending" ? "pending" : "manual_reconciliation_required";
    let providerConfirmed = false;
    try {
      const receipt = await dependencies.github.publishDesign({
        repository: workProduct.repository,
        branch: workProduct.remote_branch,
        baseBranch: "main",
        baseCommit: workProduct.base_commit,
        change: workProduct.change_id,
        title: `${issue.identifier}: OpenSpec design`,
        body: [
          `Linear: [${issue.identifier}](${issue.url})`,
          `OpenSpec change: ${workProduct.change_id}`,
          "",
          "## Review notes",
          "- Review design.md against the approved proposal and delta specs.",
          "- This PR contains design only. Tasks and implementation are out of scope.",
          "",
          "## Validation",
          `- openspec validate ${workProduct.change_id} --strict — passed`,
          "- Trusted design path and section checks — passed",
        ].join("\n"),
        content: candidate.content,
        reviewReplies: candidate.reviewReplies,
        ...(workProduct.pull_request_database_id === null ? {} : {
          expectedPullRequestDatabaseId: workProduct.pull_request_database_id,
          expectedPullRequestNumber: workProduct.pull_request_number ?? undefined,
        }),
      }, operationId);
      providerConfirmed = true;
      const state = receipt.reconciled || operation.state !== "pending" ? "reconciled" : "succeeded";
      await dependencies.designStore.recordPublication({
        runId: run.run_id,
        pullRequestDatabaseId: receipt.pullRequestDatabaseId,
        pullRequestNumber: receipt.pullRequestNumber,
        pullRequestUrl: receipt.pullRequestUrl,
        headSha: receipt.headSha,
        designDigest: candidate.designDigest,
        operationId,
        expectedOperationState,
        operationState: state,
        now: this.now().toISOString(),
      });
      return this.completed();
    } catch (error) {
      if (
        error instanceof Error && [
          "GitHub review reply manifest is incomplete",
          "GitHub review reply targets an unknown human review thread",
        ].includes(error.message)
      ) {
        const finished = await this.finishPlanningOperation({
          operationId,
          expected: expectedOperationState,
          state: "failed",
          providerResourceId: workProduct.pull_request_database_id,
          safeErrorCategory: "design_review_feedback_changed",
          now: this.now().toISOString(),
        });
        if (!finished) throw new Error("design review feedback change receipt compare-and-set failed");
        return {
          kind: "system_action",
          outcome: "review_feedback_changed",
          providerReceiptsComplete: false,
        };
      }
      const ambiguous = providerConfirmed ||
        (error instanceof Error && /ambiguous|provider request failed/i.test(error.message));
      if (operation.state === "pending") {
        await this.finishPlanningOperation({
          operationId,
          expected: "pending",
          state: ambiguous ? "manual_reconciliation_required" : "failed",
          providerResourceId: workProduct.pull_request_database_id,
          safeErrorCategory: ambiguous ? "design_publish_unconfirmed" : "design_publish_rejected",
          now: this.now().toISOString(),
        });
      }
      if (ambiguous) throw new Error("trusted design publication requires provider reconciliation");
      return this.failed();
    }
  }

  private async mergeDesign(
    run: OrchestrationRunRecord,
    nodeId: string,
    action: string,
  ): Promise<ValidatedSystemOutcome> {
    const dependencies = this.requireDesignDependencies(run);
    if (this.planning?.gateVisit === undefined) throw new Error("design gate binding reader is unavailable");
    const [workProduct, gate] = await Promise.all([
      dependencies.designStore.findWorkProduct(run.run_id),
      this.planning.gateVisit(run.run_id, "design"),
    ]);
    if (
      workProduct === null || gate === null || gate.state !== "merge_authorized" ||
      workProduct.pull_request_database_id !== gate.pull_request_database_id ||
      workProduct.pull_request_number !== gate.pull_request_number ||
      workProduct.remote_branch !== gate.head_branch || workProduct.head_sha !== gate.approved_head_sha ||
      workProduct.head_sha === null
    ) return this.failed();
    const operationId = operationIdentity(run.run_id, "system_action", `${nodeId}:${action}`, run.current_visit_sequence);
    const operation = await this.beginPlanningOperation(
      operationId,
      run.run_id,
      action,
      await sha256Hex(JSON.stringify({
        repository: gate.repository,
        pullRequestDatabaseId: gate.pull_request_database_id,
        pullRequestNumber: gate.pull_request_number,
        approvedHeadSha: gate.approved_head_sha,
      })),
    );
    if (["succeeded", "reconciled"].includes(operation.state) && workProduct.merge_commit_sha !== null) {
      return this.completed();
    }
    if (!["pending", "manual_reconciliation_required"].includes(operation.state)) return this.failed();
    let providerConfirmed = false;
    try {
      const receipt = await dependencies.github.mergeDesign({
        repository: gate.repository,
        pullRequestNumber: gate.pull_request_number,
        pullRequestDatabaseId: gate.pull_request_database_id,
        baseBranch: "main",
        headBranch: gate.head_branch,
        expectedHeadSha: gate.approved_head_sha,
      });
      providerConfirmed = true;
      await dependencies.designStore.recordMerge({
        runId: run.run_id,
        operationId,
        expectedHeadSha: gate.approved_head_sha,
        mergeCommitSha: receipt.mergeCommitSha,
        now: this.now().toISOString(),
      });
      const state = receipt.reconciled || operation.state !== "pending" ? "reconciled" : "succeeded";
      if (operation.state !== state) {
        const finished = await this.finishPlanningOperation({
          operationId,
          expected: operation.state,
          state,
          providerResourceId: receipt.pullRequestDatabaseId,
          safeErrorCategory: null,
          now: this.now().toISOString(),
        });
        if (!finished) throw new Error("design merge receipt compare-and-set failed");
      }
      return this.completed();
    } catch (error) {
      const ambiguous = providerConfirmed ||
        (error instanceof Error && /ambiguous|provider request failed/i.test(error.message));
      if (operation.state === "pending") {
        await this.finishPlanningOperation({
          operationId,
          expected: "pending",
          state: ambiguous ? "manual_reconciliation_required" : "failed",
          providerResourceId: gate.pull_request_database_id,
          safeErrorCategory: ambiguous ? "design_merge_unconfirmed" : "design_merge_rejected",
          now: this.now().toISOString(),
        });
      }
      if (ambiguous) throw new Error("design merge requires provider reconciliation");
      return this.failed();
    }
  }

  private async startDesignRound(
    run: OrchestrationRunRecord,
    nodeId: string,
    action: string,
  ): Promise<ValidatedSystemOutcome> {
    if (this.planning?.gateVisit === undefined) throw new Error("design gate binding reader is unavailable");
    const gate = await this.planning.gateVisit(run.run_id, "design");
    if (gate?.state !== "revision_requested") return this.failed();
    const operationId = operationIdentity(run.run_id, "system_action", `${nodeId}:${action}`, run.current_visit_sequence);
    const operation = await this.beginPlanningOperation(
      operationId,
      run.run_id,
      action,
      await sha256Hex(JSON.stringify({ visitSequence: gate.visit_sequence, approvedHeadSha: gate.approved_head_sha })),
    );
    if (["succeeded", "reconciled"].includes(operation.state)) return this.completed();
    const finished = await this.finishPlanningOperation({
      operationId,
      expected: operation.state,
      state: "succeeded",
      providerResourceId: `design-round-after:${gate.visit_sequence}`,
      safeErrorCategory: null,
      now: this.now().toISOString(),
    });
    return finished ? this.completed() : this.failed();
  }

  private requirePlanningDependencies(
    run: OrchestrationRunRecord,
  ): Required<Pick<PlanningSystemActionDependencies, "github" | "planningStore">> {
    if (
      this.planning === undefined ||
      this.store.beginPlanningOperation === undefined ||
      this.store.finishPlanningOperation === undefined
    ) throw new Error("planning system-action dependencies are unavailable");
    return {
      github: this.planning.githubForRun?.(run) ?? this.planning.github,
      planningStore: this.planning.planningStore,
    };
  }

  private requireDesignDependencies(run: OrchestrationRunRecord): {
    github: Pick<GitHubCapabilityAdapter, "publishDesign" | "mergeDesign">;
    designStore: Pick<D1DesignStore, "findWorkProduct" | "recordPublication" | "recordMerge">;
  } {
    const github = this.planning?.githubForRun?.(run) ?? this.planning?.github;
    if (
      github === undefined || this.planning?.designStore === undefined ||
      this.store.beginPlanningOperation === undefined || this.store.finishPlanningOperation === undefined ||
      github.publishDesign === undefined || github.mergeDesign === undefined
    ) throw new Error("design system-action dependencies are unavailable");
    return {
      github: {
        publishDesign: github.publishDesign.bind(github),
        mergeDesign: github.mergeDesign.bind(github),
      },
      designStore: this.planning.designStore,
    };
  }

  private beginPlanningOperation(
    operationId: string,
    runId: string,
    action: string,
    requestDigest: string,
  ): Promise<ProviderOperationRecord> {
    if (this.store.beginPlanningOperation === undefined) throw new Error("planning operation store is unavailable");
    return this.store.beginPlanningOperation({
      operationId,
      runId,
      action,
      requestDigest,
      now: this.now().toISOString(),
    });
  }

  private finishPlanningOperation(input: Parameters<NonNullable<SystemActionStore["finishPlanningOperation"]>>[0]) {
    if (this.store.finishPlanningOperation === undefined) throw new Error("planning operation store is unavailable");
    return this.store.finishPlanningOperation(input);
  }

  private completed(): ValidatedSystemOutcome {
    return { kind: "system_action", outcome: "completed", providerReceiptsComplete: true };
  }

  private failed(): ValidatedSystemOutcome {
    return { kind: "system_action", outcome: "failed", providerReceiptsComplete: false };
  }
}
