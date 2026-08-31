import {
  ArtifactCollector,
  D1ArtifactManifestStore,
  R2ArtifactObjectStore,
} from "./artifact-collector.ts";
import { mintCapabilityToken, type CapabilityAction } from "./capability-auth.ts";
import {
  CredentialVault,
  D1CredentialLeaseStore,
  R2ProtectedObjectStore,
} from "./credential-vault.ts";
import {
  D1LinearOperationStore,
  LinearTransitionController,
} from "./linear-transition.ts";
import {
  D1OrchestrationStore,
  type OrchestrationRunRecord,
} from "./orchestration-store.ts";
import {
  D1AgentAttemptStore,
  defaultAttemptId,
  SandboxAgentController,
} from "./sandbox-controller.ts";
import {
  CloudflareSandboxFactory,
  SandboxArtifactReaderAdapter,
} from "./sandbox-platform.ts";
import { D1SystemActionStore, SystemActionController } from "./system-actions.ts";
import type { WorkflowNodeServices } from "./workflow-orchestrator.ts";
import type { HumanGateWorkflowNode, LoadedWorkflowDefinition } from "./workflow-definition.ts";
import { writeLifecycleObservation } from "./lifecycle-telemetry.ts";
import { JobInputMaterializer } from "./job-inputs.ts";
import { D1ProviderReceiptVerifier } from "./capability-store.ts";
import { D1PlanningStore } from "./planning-store.ts";
import { GitHubAppTokenProvider, GitHubCapabilityAdapter } from "./github-capability.ts";
import { LinearCapabilityAdapter } from "./linear-capability.ts";
import { operationIdentity } from "./orchestration-identity.ts";
import {
  buildPlanningCandidate,
  persistCandidateEvidence,
  PlanningCandidateRejectedError,
} from "./planning-candidate.ts";
import { D1TraceReviewStore } from "./trace-review-store.ts";
import {
  deriveReviewOutcome,
  findingSetDigest,
  LATER_ROUND_REVIEW_STAGES,
  normalizeFindingSet,
  reviewInputId,
  validateClosedSetRecheck,
  workflowOutcomeForReview,
  type TraceFinding,
  type TraceRecheckResult,
} from "./trace-review.ts";
import bettaViewBundleManifest from "../vendor/bettaview/bundle-manifest.json" with { type: "json" };
import { AGENT_HARNESS, AGENT_HARNESS_VERSION } from "./agent-harness.ts";

const durationMs = (value: string): number => {
  const match = value.match(/^(\d+(?:\.\d+)?)(ms|s|m|h|d)$/);
  if (match === null) throw new Error("workflow duration is invalid");
  const multiplier = { ms: 1, s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2]];
  if (multiplier === undefined) throw new Error("workflow duration unit is invalid");
  return Number(match[1]) * multiplier;
};

const sha256Hex = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const githubForRun = (env: Env, run: OrchestrationRunRecord): GitHubCapabilityAdapter => {
  const installationId = run.route_github_installation_id;
  if (installationId === null || installationId === undefined) {
    throw new Error("frozen GitHub App installation is missing");
  }
  return new GitHubCapabilityAdapter(
    env.GITHUB_API_URL,
    new GitHubAppTokenProvider({
      apiUrl: env.GITHUB_API_URL,
      appId: env.GITHUB_APP_ID,
      privateKey: env.GITHUB_APP_PRIVATE_KEY,
      installationId,
    }),
  );
};

export class CloudflareWorkflowServices implements WorkflowNodeServices {
  private readonly env: Env;
  private readonly orchestration: D1OrchestrationStore;
  private readonly agents: SandboxAgentController;
  private readonly systemActions: SystemActionController;
  private readonly linear: LinearTransitionController;

  constructor(env: Env, definition: LoadedWorkflowDefinition) {
    this.env = env;
    this.orchestration = new D1OrchestrationStore(env.DB);
    const credentials = new CredentialVault(
      new R2ProtectedObjectStore(env.ARTIFACTS),
      new D1CredentialLeaseStore(env.DB),
      env.CODEX_AUTH_ENCRYPTION_KEY,
    );
    const artifactObjects = new R2ArtifactObjectStore(env.ARTIFACTS);
    const artifactManifests = new D1ArtifactManifestStore(env.DB);
    const jobInputs = new JobInputMaterializer(
      env.DB,
      env.ARTIFACTS,
      env.LINEAR_API_URL,
      env.LINEAR_APP_ACCESS_TOKEN,
      {
        readGitHubReviewFeedback: (repository, pullRequestNumber, installationId) =>
          new GitHubCapabilityAdapter(
            env.GITHUB_API_URL,
            new GitHubAppTokenProvider({
              apiUrl: env.GITHUB_API_URL,
              appId: env.GITHUB_APP_ID,
              privateKey: env.GITHUB_APP_PRIVATE_KEY,
              installationId,
            }),
          ).readReviewFeedback(repository, pullRequestNumber),
      },
    );
    this.agents = new SandboxAgentController(
      new D1AgentAttemptStore(env.DB),
      new CloudflareSandboxFactory(env.Sandbox),
      credentials,
      {
        authProfileId: env.CODEX_AUTH_PROFILE_ID,
        absoluteTimeoutMs: durationMs(definition.execution.attemptTimeout),
        heartbeatTimeoutMs: durationMs(definition.execution.heartbeatTimeout),
        failureRetentionMs: Math.min(
          24 * 60,
          Math.max(0, Number.parseInt(env.SANDBOX_FAILURE_RETENTION_MINUTES, 10) || 0),
        ) * 60_000,
      },
      {
        now: () => new Date(),
        attemptId: defaultAttemptId,
        materializeContext: (run, job) => jobInputs.materialize(run, job),
        readContinuationPatch: async (reference) => {
          const object = await env.ARTIFACTS.get(reference.r2Key);
          if (object === null) throw new Error("continuation patch object is missing");
          return object.text();
        },
        capabilityGrant: (attemptId, runId, job, repository, changeId, planningBranch) =>
          this.capabilityGrant(attemptId, runId, job, repository, changeId, planningBranch),
        protectPrompt: async ({ attemptId, content }) => {
          const r2Key = `protected/prompts/${attemptId}.md`;
          const digest = await sha256Hex(content);
          const existing = await env.ARTIFACTS.get(r2Key);
          if (existing === null) {
            await env.ARTIFACTS.put(r2Key, content, {
              httpMetadata: { contentType: "text/markdown; charset=utf-8" },
              customMetadata: { sha256: digest, evidenceClass: "service-authored-prompt" },
            });
          } else if (await sha256Hex(await existing.text()) !== digest) {
            throw new Error("protected rendered prompt object conflict");
          }
          const readBack = await env.ARTIFACTS.get(r2Key);
          if (readBack === null || await sha256Hex(await readBack.text()) !== digest) {
            throw new Error("protected rendered prompt object read-back failed");
          }
          return { r2Key, sha256: digest };
        },
        collector: (sandbox) => new ArtifactCollector(
          new SandboxArtifactReaderAdapter(sandbox),
          artifactObjects,
          artifactManifests,
        ),
        providerReceipts: new D1ProviderReceiptVerifier(env.DB),
        persistPlanningCandidate: async ({
          run,
          attempt,
          baseCommit,
          change,
          files,
          reviewReplies,
          reviewDispositions,
          reviewContextId,
        }) => {
          const activeRound = await env.DB.prepare(
            "SELECT COALESCE(MAX(round), 1) AS round FROM trace_review_phases WHERE run_id = ?",
          ).bind(run.run_id).first<{ round: number }>();
          let built;
          try {
            built = await buildPlanningCandidate({
              candidateId: `candidate:${attempt.attempt_id}`,
              runId: run.run_id,
              round: activeRound?.round ?? 1,
              sourceAttemptId: attempt.attempt_id,
              baseCommit,
              change,
              files,
              reviewReplies,
              reviewDispositions,
              reviewContextId,
              strictOpenSpecCheck: async () => {},
              checkedAt: new Date().toISOString(),
            });
          } catch (error) {
            throw new PlanningCandidateRejectedError(
              error instanceof Error ? error.message : "trusted planning candidate was rejected",
            );
          }
          const duplicate = await env.DB.prepare(
            `SELECT candidate_id FROM planning_candidates
             WHERE run_id = ? AND round = ? AND candidate_digest = ? LIMIT 1`,
          ).bind(run.run_id, built.candidate.round, built.candidate.candidateDigest)
            .first<{ candidate_id: string }>();
          if (duplicate !== null) {
            throw new PlanningCandidateRejectedError("planning candidate has no semantic changes");
          }
          const evidence = await persistCandidateEvidence(env.ARTIFACTS, built);
          await new D1TraceReviewStore(env.DB).recordCandidate(evidence);
        },
        acceptTraceReview: async ({ run, attempt, job, collection }) => {
          const candidate = await env.DB.prepare(
            `SELECT candidate_id, candidate_digest, review_set_digest, file_list_json, round
             FROM planning_candidates
             WHERE run_id = ? AND state = 'validated'
             ORDER BY created_at DESC, candidate_id DESC LIMIT 1`,
          ).bind(run.run_id).first<{
            candidate_id: string;
            candidate_digest: string;
            review_set_digest: string;
            file_list_json: string;
            round: number;
          }>();
          if (candidate === null) throw new Error("trace review candidate is missing");
          const workProduct = await new D1PlanningStore(env.DB).findRunWorkProduct(run.run_id);
          const stage = job.modelProvider === "openrouter" ? "independent" as const : "self_check" as const;
          const reviewedHeadSha = stage === "independent" ? workProduct?.head_sha ?? null : null;
          if (stage === "independent" && reviewedHeadSha === null) {
            throw new Error("independent trace review head is missing");
          }
          const candidateFiles = JSON.parse(candidate.file_list_json) as Array<{
            path: string;
            sha256: string;
          }>;
          const change = workProduct?.change_id ?? candidateFiles[0]?.path.split("/")[2];
          if (typeof change !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(change)) {
            throw new Error("trace review change is invalid");
          }
          const prefix = `openspec/changes/${change}/`;
          const sources = candidateFiles
            .filter((file) => file.path.endsWith("proposal.md") || file.path.includes("/specs/"))
            .map((file) => ({ path: file.path.slice(prefix.length), sha256: file.sha256 }));
          const mode = job.reviewMode;
          if (mode === undefined) throw new Error("trace review mode is missing");
          const inventoryReceipt = await env.DB.prepare(
            `SELECT r2_key, sha256 FROM artifacts
             WHERE manifest_id = ? AND logical_name = 'candidate-inventory.json' LIMIT 1`,
          ).bind(collection.manifestId).first<{ r2_key: string; sha256: string }>();
          if (inventoryReceipt === null) throw new Error("trace review inventory receipt is missing");
          const inventoryObject = await env.ARTIFACTS.get(inventoryReceipt.r2_key);
          if (inventoryObject === null) throw new Error("trace review inventory object is missing");
          const inventoryText = await inventoryObject.text();
          if (await sha256Hex(inventoryText) !== inventoryReceipt.sha256) {
            throw new Error("trace review inventory hash mismatch");
          }
          const inventory = JSON.parse(inventoryText) as {
            findings?: TraceFinding[];
            findingSetDigest?: string;
            resolutions?: TraceRecheckResult["resolutions"];
          };
          const findings = normalizeFindingSet(inventory.findings ?? []);
          const trustedFindingSetDigest = await findingSetDigest(findings);
          if (inventory.findingSetDigest !== trustedFindingSetDigest) {
            throw new Error("trace review finding inventory digest mismatch");
          }
          let trustedOutcome: "pass" | "findings" | "proof_conflict";
          if (mode === "recheck") {
            const resolutions = await validateClosedSetRecheck(findings, {
              mode: "recheck",
              baselineFindingSetDigest: trustedFindingSetDigest,
              resolutions: inventory.resolutions ?? [],
              sidecar: {},
            });
            const prior = await env.DB.prepare(
              `SELECT inventory.r2_key, inventory.sha256
               FROM trace_reviews review
               JOIN artifacts inventory
                 ON inventory.manifest_id = review.proof_manifest_id
                AND inventory.logical_name = 'candidate-inventory.json'
               WHERE review.run_id = ? AND review.phase = ? AND review.accepted = 1
               ORDER BY review.completed_at DESC, review.review_id DESC LIMIT 1`,
            ).bind(run.run_id, stage).first<{ r2_key: string; sha256: string }>();
            const priorFixed = new Set<string>();
            if (prior !== null) {
              const priorObject = await env.ARTIFACTS.get(prior.r2_key);
              if (priorObject === null) throw new Error("prior trace review inventory is missing");
              const priorText = await priorObject.text();
              if (await sha256Hex(priorText) !== prior.sha256) {
                throw new Error("prior trace review inventory hash mismatch");
              }
              const priorInventory = JSON.parse(priorText) as {
                resolutions?: Array<{ findingId?: string; status?: string }>;
              };
              for (const resolution of priorInventory.resolutions ?? []) {
                if (resolution.status === "fixed" && typeof resolution.findingId === "string") {
                  priorFixed.add(resolution.findingId);
                }
              }
            }
            trustedOutcome = deriveReviewOutcome(resolutions, priorFixed).outcome;
          } else {
            trustedOutcome = findings.length === 0 ? "pass" : "findings";
          }
          if (String(collection.result.findingSetDigest) !== trustedFindingSetDigest) {
            throw new Error("trace review result digest mismatch");
          }
          const bundleSha256 = await sha256Hex(JSON.stringify(bettaViewBundleManifest));
          const inputId = await reviewInputId({
            stage,
            mode,
            round: candidate.round,
            candidateDigest: candidate.candidate_digest,
            reviewedHeadSha,
            sources,
            baselineFindingSetDigest: mode === "recheck" ? trustedFindingSetDigest : null,
            author: {
              harness: AGENT_HARNESS,
              harnessVersion: AGENT_HARNESS_VERSION,
              provider: "codex",
              model: run.author_model ?? "",
              reasoning: run.author_reasoning ?? "",
            },
            reviewer: {
              harness: AGENT_HARNESS,
              harnessVersion: AGENT_HARNESS_VERSION,
              provider: job.modelProvider ?? "codex",
              model: job.model ?? "",
              reasoning: job.reasoning ?? "",
            },
            promptVersion: "openspec-semantic-traceability-directional-v3",
            promptSha256: await sha256Hex(job.prompt),
            toolVersion: bettaViewBundleManifest.bundleVersion,
            bundleSha256,
          });
          const sidecar = await env.DB.prepare(
            `SELECT r2_key FROM artifacts
             WHERE manifest_id = ? AND logical_name = 'bettaview-traceability.json' LIMIT 1`,
          ).bind(collection.manifestId).first<{ r2_key: string }>();
          if (sidecar === null) throw new Error("trace review sidecar receipt is missing");
          const store = new D1TraceReviewStore(env.DB);
          const existingPhase = await store.findPhase(run.run_id, candidate.round, stage);
          if (mode === "recheck" && existingPhase === null) {
            throw new Error("trace recheck has no discovery baseline");
          }
          const shared = await env.DB.prepare(
            "SELECT COALESCE(MAX(shared_repair_turns), 0) AS turns FROM trace_review_phases WHERE run_id = ? AND round = ?",
          ).bind(run.run_id, candidate.round).first<{ turns: number }>();
          const phase = existingPhase ?? await store.ensurePhase({
            runId: run.run_id,
            round: candidate.round,
            stage,
            candidateId: candidate.candidate_id,
            headSha: reviewedHeadSha,
            sharedRepairTurns: shared?.turns ?? 0,
            now: new Date().toISOString(),
          });
          const currentTurns = Math.max(phase.shared_repair_turns, shared?.turns ?? 0);
          const nextTurns = stage === "self_check" && trustedOutcome === "findings" && currentTurns < 3
            ? currentTurns + 1
            : currentTurns;
          const workflowOutcome = workflowOutcomeForReview(stage, trustedOutcome, currentTurns);
          const reviewId = `review:${attempt.attempt_id}`;
          const now = new Date().toISOString();
          await store.acceptReview({
            review_id: reviewId,
            review_input_id: inputId,
            run_id: run.run_id,
            attempt_id: attempt.attempt_id,
            phase: stage,
            mode,
            round: candidate.round,
            candidate_id: candidate.candidate_id,
            reviewed_head_sha: reviewedHeadSha,
            author_model_provider: "codex",
            author_model: run.author_model ?? "",
            reviewer_provider: job.modelProvider ?? "codex",
            reviewer_model: job.model ?? "",
            agent_harness: AGENT_HARNESS,
            agent_harness_version: AGENT_HARNESS_VERSION,
            reasoning_effort: job.reasoning ?? "",
            prompt_version: "openspec-semantic-traceability-directional-v3",
            prompt_sha256: await sha256Hex(job.prompt),
            tool_version: bettaViewBundleManifest.bundleVersion,
            bundle_sha256: bundleSha256,
            baseline_finding_set_digest: trustedFindingSetDigest,
            proof_manifest_id: collection.manifestId,
            sidecar_r2_key: sidecar.r2_key,
            overall_outcome: workflowOutcome,
            reused_from_review_id: null,
            conflicting_review_id: null,
            created_at: now,
            completed_at: now,
          });
          if (stage === "independent" && workProduct !== null && workProduct.pull_request_number !== null && reviewedHeadSha !== null) {
            const receipt = JSON.stringify({
              version: 1,
              reviewId,
              repository: workProduct.repository,
              pullRequestNumber: workProduct.pull_request_number,
              headSha: reviewedHeadSha,
              reviewedFilesDigest: candidate.review_set_digest,
              sources,
            });
            const receiptSha256 = await sha256Hex(receipt);
            const receiptR2Key = `runs/${encodeURIComponent(run.run_id)}/review-head-bindings/${encodeURIComponent(reviewId)}/${reviewedHeadSha}.json`;
            const existing = await env.ARTIFACTS.get(receiptR2Key);
            if (existing === null) {
              await env.ARTIFACTS.put(receiptR2Key, receipt, {
                onlyIf: { etagDoesNotMatch: "*" },
                httpMetadata: { contentType: "application/json" },
                customMetadata: { sha256: receiptSha256, policy: "deos-trace-review-v1" },
              });
            }
            const readBack = await env.ARTIFACTS.get(receiptR2Key);
            if (readBack === null || await sha256Hex(await readBack.text()) !== receiptSha256) {
              throw new Error("trace review head comparison receipt read-back failed");
            }
            await store.bindHead({
              bindingId: `binding:${reviewId}:${reviewedHeadSha}`,
              reviewId,
              repository: workProduct.repository,
              pullRequestNumber: workProduct.pull_request_number,
              headSha: reviewedHeadSha,
              reviewedFilesDigest: candidate.review_set_digest,
              receiptR2Key,
              receiptSha256,
              now,
            });
          }
          await store.compareAndSetPhase({
            runId: run.run_id,
            round: candidate.round,
            stage,
            expectedRevision: phase.revision,
            expectedState: phase.state,
            nextState: workflowOutcome === "pass"
              ? "closed_pass"
              : workflowOutcome === "needs_judgment"
                ? "closed_needs_judgment"
                : workflowOutcome === "proof_conflict" ? "proof_conflict" : "findings_open",
            candidateId: candidate.candidate_id,
            headSha: reviewedHeadSha,
            reviewInputId: inputId,
            baseFindingSetDigest: trustedFindingSetDigest,
            acceptedReviewId: reviewId,
            sharedRepairTurns: nextTurns,
            reviewJobCount: phase.review_job_count + 1,
            proofRepairCount: phase.proof_repair_count + Number(collection.result.proofRepairCount),
            now,
          });
          await this.syncTraceReviewProviders({
            run,
            reviewId,
            stage,
            outcome: workflowOutcome,
            findingCount: Number(collection.result.findingCount),
            confirmedLinkCount: Number(collection.result.confirmedLinkCount ?? 0),
            disputedLinkCount: Number(collection.result.disputedLinkCount ?? 0),
            headSha: reviewedHeadSha,
          });
          return workflowOutcome;
        },
        reuseTraceReview: async (run, nodeId, job) => {
          const candidate = await env.DB.prepare(
            `SELECT candidate_id, candidate_digest, review_set_digest, change_id, file_list_json, round
             FROM planning_candidates
             WHERE run_id = ? AND state = 'validated'
             ORDER BY created_at DESC, candidate_id DESC LIMIT 1`,
          ).bind(run.run_id).first<{
            candidate_id: string;
            candidate_digest: string;
            review_set_digest: string;
            change_id: string;
            file_list_json: string;
            round: number;
          }>();
          if (candidate === null) return null;
          const stage = job.modelProvider === "openrouter" ? "independent" as const : "self_check" as const;
          const mode = job.reviewMode;
          if (mode === undefined) return null;
          const workProduct = stage === "independent"
            ? await new D1PlanningStore(env.DB).findRunWorkProduct(run.run_id)
            : null;
          const reviewedHeadSha = stage === "independent" ? workProduct?.head_sha ?? null : null;
          if (stage === "independent" && reviewedHeadSha === null) return null;
          const prefix = `openspec/changes/${candidate.change_id}/`;
          const sources = (JSON.parse(candidate.file_list_json) as Array<{ path: string; sha256: string }>)
            .filter((file) => file.path.endsWith("proposal.md") || file.path.includes("/specs/"))
            .map((file) => ({ path: file.path.slice(prefix.length), sha256: file.sha256 }));
          const phase = await new D1TraceReviewStore(env.DB).findPhase(run.run_id, candidate.round, stage);
          const baselineFindingSetDigest = mode === "recheck"
            ? phase?.base_finding_set_digest ?? null
            : null;
          if (mode === "recheck" && baselineFindingSetDigest === null) return null;
          const inputId = await reviewInputId({
            stage,
            mode,
            round: candidate.round,
            candidateDigest: candidate.candidate_digest,
            reviewedHeadSha,
            sources,
            baselineFindingSetDigest,
            author: {
              harness: AGENT_HARNESS,
              harnessVersion: AGENT_HARNESS_VERSION,
              provider: "codex",
              model: run.author_model ?? "",
              reasoning: run.author_reasoning ?? "",
            },
            reviewer: {
              harness: AGENT_HARNESS,
              harnessVersion: AGENT_HARNESS_VERSION,
              provider: job.modelProvider ?? "codex",
              model: job.model ?? "",
              reasoning: job.reasoning ?? "",
            },
            promptVersion: "openspec-semantic-traceability-directional-v3",
            promptSha256: await sha256Hex(job.prompt),
            toolVersion: bettaViewBundleManifest.bundleVersion,
            bundleSha256: await sha256Hex(JSON.stringify(bettaViewBundleManifest)),
          });
          const reviewStore = new D1TraceReviewStore(env.DB);
          let accepted = await reviewStore.findAcceptedInput(inputId);
          if (accepted !== null) {
            const { accepted: _accepted, ...source } = accepted;
            const reuseDigest = await sha256Hex(`${run.run_id}\0${nodeId}\0${inputId}`);
            const reuseUuid = `${reuseDigest.slice(0, 8)}-${reuseDigest.slice(8, 12)}-${reuseDigest.slice(12, 16)}-${reuseDigest.slice(16, 20)}-${reuseDigest.slice(20, 32)}`;
            await reviewStore.recordReuse({
              ...source,
              review_id: `reuse:${reuseUuid}`,
              attempt_id: null,
              reused_from_review_id: accepted.review_id,
              conflicting_review_id: null,
              created_at: new Date().toISOString(),
              completed_at: new Date().toISOString(),
            });
          }
          if (
            accepted === null && stage === "independent" && workProduct !== null &&
            workProduct.pull_request_number !== null && reviewedHeadSha !== null
          ) {
            const reusable = await env.DB.prepare(
              `SELECT * FROM trace_reviews
               WHERE run_id = ? AND phase = ? AND mode = ? AND round = ?
                 AND candidate_id = ? AND reviewer_provider = ? AND reviewer_model = ?
                 AND accepted = 1
               ORDER BY completed_at DESC, review_id DESC LIMIT 1`,
            ).bind(
              run.run_id,
              stage,
              mode,
              candidate.round,
              candidate.candidate_id,
              job.modelProvider,
              job.model,
            ).first<import("./trace-review-store.ts").TraceReviewRecord>();
            if (reusable !== null && reusable.reviewed_head_sha !== reviewedHeadSha) {
              const github = githubForRun(env, run);
              const exact = await Promise.all(sources.map(async (source) =>
                await sha256Hex(await github.readFileAtRef(
                  workProduct.repository,
                  `${prefix}${source.path}`,
                  reviewedHeadSha,
                )) === source.sha256));
              if (exact.every(Boolean)) {
                const now = new Date().toISOString();
                const uuid = `${inputId.slice(0, 8)}-${inputId.slice(8, 12)}-${inputId.slice(12, 16)}-${inputId.slice(16, 20)}-${inputId.slice(20, 32)}`;
                const reviewId = `review:${uuid}`;
                accepted = await reviewStore.acceptReview({
                  ...reusable,
                  review_id: reviewId,
                  review_input_id: inputId,
                  attempt_id: null,
                  reviewed_head_sha: reviewedHeadSha,
                  reused_from_review_id: reusable.review_id,
                  conflicting_review_id: null,
                  created_at: now,
                  completed_at: now,
                });
                const receipt = JSON.stringify({
                  version: 1,
                  reusedFromReviewId: reusable.review_id,
                  reviewId,
                  repository: workProduct.repository,
                  pullRequestNumber: workProduct.pull_request_number,
                  headSha: reviewedHeadSha,
                  reviewedFilesDigest: candidate.review_set_digest,
                  sources,
                });
                const receiptSha256 = await sha256Hex(receipt);
                const receiptR2Key = `runs/${encodeURIComponent(run.run_id)}/review-head-bindings/${encodeURIComponent(reviewId)}/${reviewedHeadSha}.json`;
                await env.ARTIFACTS.put(receiptR2Key, receipt, {
                  onlyIf: { etagDoesNotMatch: "*" },
                  httpMetadata: { contentType: "application/json" },
                  customMetadata: { sha256: receiptSha256, policy: "deos-trace-review-v1" },
                });
                const readBack = await env.ARTIFACTS.get(receiptR2Key);
                if (readBack === null || await sha256Hex(await readBack.text()) !== receiptSha256) {
                  throw new Error("reused review head receipt read-back failed");
                }
                await reviewStore.bindHead({
                  bindingId: `binding:${reviewId}:${reviewedHeadSha}`,
                  reviewId,
                  repository: workProduct.repository,
                  pullRequestNumber: workProduct.pull_request_number,
                  headSha: reviewedHeadSha,
                  reviewedFilesDigest: candidate.review_set_digest,
                  receiptR2Key,
                  receiptSha256,
                  now,
                });
                if (phase !== null) {
                  await reviewStore.compareAndSetPhase({
                    runId: run.run_id,
                    round: candidate.round,
                    stage,
                    expectedRevision: phase.revision,
                    expectedState: phase.state,
                    nextState: phase.state,
                    candidateId: candidate.candidate_id,
                    headSha: reviewedHeadSha,
                    reviewInputId: inputId,
                    baseFindingSetDigest: phase.base_finding_set_digest,
                    acceptedReviewId: reviewId,
                    sharedRepairTurns: phase.shared_repair_turns,
                    reviewJobCount: phase.review_job_count,
                    proofRepairCount: phase.proof_repair_count,
                    now,
                  });
                }
              }
            }
          }
          if (accepted === null) return null;
          return {
            state: "completed",
            attemptId: null,
            sandboxId: null,
            manifestId: accepted.proof_manifest_id,
            outcome: {
              kind: "agent",
              outcome: accepted.overall_outcome,
              providerReceiptsPresent: accepted.reviewer_provider === "openrouter",
              providerReceiptsComplete: true,
            },
          };
        },
        lifecycle: writeLifecycleObservation,
      },
    );
    this.systemActions = new SystemActionController(
      new D1SystemActionStore(env.DB),
      {
        github: new GitHubCapabilityAdapter(
          env.GITHUB_API_URL,
          new GitHubAppTokenProvider({
            apiUrl: env.GITHUB_API_URL,
            appId: env.GITHUB_APP_ID,
            privateKey: env.GITHUB_APP_PRIVATE_KEY,
            installationId: env.GITHUB_INSTALLATION_ID,
          }),
        ),
        githubForRun: (run) => githubForRun(env, run),
        planningStore: new D1PlanningStore(env.DB),
        planningCandidate: async (runId) => {
          const row = await env.DB.prepare(
            `SELECT candidate_id, candidate_digest, change_id, candidate_r2_key,
                    candidate_sha256
             FROM planning_candidates
             WHERE run_id = ? AND state = 'validated'
             ORDER BY created_at DESC, candidate_id DESC LIMIT 1`,
          ).bind(runId).first<{
            candidate_id: string;
            candidate_digest: string;
            change_id: string;
            candidate_r2_key: string;
            candidate_sha256: string;
          }>();
          if (row === null) return null;
          const object = await env.ARTIFACTS.get(row.candidate_r2_key);
          if (object === null) throw new Error("trusted planning candidate is missing");
          const text = await object.text();
          if (await sha256Hex(text) !== row.candidate_sha256) {
            throw new Error("trusted planning candidate hash mismatch");
          }
          const candidate = JSON.parse(text) as {
            candidateId: string;
            candidateDigest: string;
            change: string;
            files: Array<{ path: string; content: string; sha256: string; byteSize: number }>;
            reviewReplies: Array<{ commentId: number; body: string }>;
            reviewDispositions?: Array<{
              itemId: string;
              status: "applied" | "declined" | "no_change";
              reason: string;
            }>;
            reviewContextId?: string | null;
          };
          if (
            candidate.candidateId !== row.candidate_id ||
            candidate.candidateDigest !== row.candidate_digest ||
            candidate.change !== row.change_id || !Array.isArray(candidate.files) ||
            !Array.isArray(candidate.reviewReplies) ||
            !(candidate.reviewContextId === undefined || candidate.reviewContextId === null ||
              typeof candidate.reviewContextId === "string")
          ) throw new Error("trusted planning candidate identity mismatch");
          return {
            ...candidate,
            reviewDispositions: candidate.reviewDispositions ?? [],
            reviewContextId: candidate.reviewContextId ?? null,
          };
        },
        issueContext: (runId) => env.DB.prepare(
          `SELECT issue.issue_key AS identifier, issue.linear_url AS url
           FROM orchestration_runs run
           JOIN linear_issue_index issue
             ON issue.issue_id = run.issue_id AND issue.project_id = run.project_id
           WHERE run.run_id = ? LIMIT 1`,
        ).bind(runId).first<{ identifier: string; url: string }>(),
      },
    );
    this.linear = new LinearTransitionController(
      new D1LinearOperationStore(env.DB),
      {
        apiUrl: env.LINEAR_API_URL,
        accessToken: env.LINEAR_APP_ACCESS_TOKEN,
        appActorId: env.LINEAR_APP_ACTOR_ID,
        humanGateStateId: env.LINEAR_HUMAN_APPROVAL_STATE_ID,
        startStateId: env.LINEAR_START_STATE_ID,
        workStateId: env.LINEAR_WORK_STATE_ID,
      },
    );
  }

  executeAgent(
    run: OrchestrationRunRecord,
    nodeId: string,
    jobId: string,
    definition: LoadedWorkflowDefinition,
  ) {
    return this.agents.execute(run, nodeId, jobId, definition);
  }

  executeSystemAction(run: OrchestrationRunRecord, nodeId: string, action: string) {
    if (action === "linear.delegate_and_start") {
      return this.linear.ensureWorkStarted(run, nodeId);
    }
    if (action === "traceability.start_new_round") {
      return this.startTraceReviewRound(run, nodeId);
    }
    if (action === "traceability.publish_author_response") {
      return this.publishTraceReviewAuthorResponse(run);
    }
    return this.systemActions.execute(run, nodeId, action);
  }

  private async publishTraceReviewAuthorResponse(run: OrchestrationRunRecord) {
    const candidateRow = await this.env.DB.prepare(
      `SELECT candidate_r2_key, candidate_sha256
       FROM planning_candidates WHERE run_id = ? AND state = 'validated'
       ORDER BY created_at DESC, candidate_id DESC LIMIT 1`,
    ).bind(run.run_id).first<{ candidate_r2_key: string; candidate_sha256: string }>();
    if (candidateRow === null) {
      return { kind: "system_action" as const, outcome: "failed" as const, providerReceiptsComplete: false };
    }
    const candidateObject = await this.env.ARTIFACTS.get(candidateRow.candidate_r2_key);
    if (candidateObject === null) throw new Error("author response candidate is missing");
    const candidateText = await candidateObject.text();
    if (await sha256Hex(candidateText) !== candidateRow.candidate_sha256) {
      throw new Error("author response candidate hash mismatch");
    }
    const candidate = JSON.parse(candidateText) as {
      reviewContextId?: unknown;
      reviewDispositions?: Array<{ status?: unknown }>;
    };
    if (typeof candidate.reviewContextId !== "string" || !Array.isArray(candidate.reviewDispositions)) {
      throw new Error("author response candidate is invalid");
    }
    const review = await this.env.DB.prepare(
      `SELECT review.review_id, review.reviewed_head_sha,
              inventory.r2_key AS inventory_r2_key, inventory.sha256 AS inventory_sha256
       FROM trace_reviews review
       JOIN artifacts inventory
         ON inventory.manifest_id = review.proof_manifest_id
        AND inventory.logical_name = 'candidate-inventory.json'
       WHERE review.review_id = ? AND review.run_id = ? AND review.phase = 'independent'
         AND review.accepted = 1 LIMIT 1`,
    ).bind(candidate.reviewContextId, run.run_id).first<{
      review_id: string;
      reviewed_head_sha: string | null;
      inventory_r2_key: string;
      inventory_sha256: string;
    }>();
    if (review === null) throw new Error("author response review is missing");
    const inventoryObject = await this.env.ARTIFACTS.get(review.inventory_r2_key);
    if (inventoryObject === null) throw new Error("author response inventory is missing");
    const inventoryText = await inventoryObject.text();
    if (await sha256Hex(inventoryText) !== review.inventory_sha256) {
      throw new Error("author response inventory hash mismatch");
    }
    const inventory = JSON.parse(inventoryText) as {
      findings?: unknown[];
      directionalClaims?: Array<{ status?: unknown }>;
    };
    const dispositions = { applied: 0, declined: 0, no_change: 0 };
    for (const disposition of candidate.reviewDispositions) {
      if (!["applied", "declined", "no_change"].includes(String(disposition.status))) {
        throw new Error("author response disposition is invalid");
      }
      dispositions[disposition.status as keyof typeof dispositions] += 1;
    }
    const workProduct = await new D1PlanningStore(this.env.DB).findRunWorkProduct(run.run_id);
    if (workProduct?.head_sha === null || workProduct?.head_sha === undefined) {
      throw new Error("author response pull request head is missing");
    }
    const directionalClaims = inventory.directionalClaims ?? [];
    const complete = await this.syncTraceReviewProviders({
      run,
      reviewId: review.review_id,
      stage: "independent",
      outcome: "pass",
      findingCount: inventory.findings?.length ?? 0,
      confirmedLinkCount: directionalClaims.filter((claim) => claim.status === "confirmed").length,
      disputedLinkCount: directionalClaims.filter((claim) => claim.status !== "confirmed").length,
      headSha: workProduct.head_sha,
      authorResponse: dispositions,
    });
    return {
      kind: "system_action" as const,
      outcome: complete ? "completed" as const : "failed" as const,
      providerReceiptsComplete: complete,
    };
  }

  private async startTraceReviewRound(run: OrchestrationRunRecord, nodeId: string) {
    const operations = new D1SystemActionStore(this.env.DB);
    const operationId = operationIdentity(
      run.run_id,
      "system_action",
      `${nodeId}:traceability.start_new_round`,
      run.current_visit_sequence,
    );
    const operation = await operations.beginPlanningOperation({
      operationId,
      runId: run.run_id,
      action: "traceability.start_new_round",
      requestDigest: await sha256Hex(JSON.stringify({
        runId: run.run_id,
        visitSequence: run.current_visit_sequence,
      })),
      now: new Date().toISOString(),
    });
    if (["succeeded", "reconciled"].includes(operation.state)) {
      return { kind: "system_action" as const, outcome: "completed" as const, providerReceiptsComplete: true };
    }
    if (operation.state !== "pending") {
      return { kind: "system_action" as const, outcome: "failed" as const, providerReceiptsComplete: false };
    }
    const [roundRow, candidate, workProduct] = await Promise.all([
      this.env.DB.prepare(
        "SELECT COALESCE(MAX(round), 0) + 1 AS round FROM trace_review_phases WHERE run_id = ?",
      ).bind(run.run_id).first<{ round: number }>(),
      this.env.DB.prepare(
        `SELECT candidate_id FROM planning_candidates WHERE run_id = ? AND state = 'validated'
         ORDER BY created_at DESC, candidate_id DESC LIMIT 1`,
      ).bind(run.run_id).first<{ candidate_id: string }>(),
      new D1PlanningStore(this.env.DB).findRunWorkProduct(run.run_id),
    ]);
    if (candidate === null || roundRow === null) {
      return { kind: "system_action" as const, outcome: "failed" as const, providerReceiptsComplete: false };
    }
    const now = new Date().toISOString();
    const results = await this.env.DB.batch([
      ...LATER_ROUND_REVIEW_STAGES.map((stage) => this.env.DB.prepare(
        `INSERT OR IGNORE INTO trace_review_phases
         (run_id, round, stage, state, current_candidate_id, current_head_sha,
          shared_repair_turns, review_job_count, proof_repair_count, revision,
          created_at, updated_at)
         VALUES (?, ?, ?, 'awaiting_repair', ?, ?, 0, 0, 0, 1, ?, ?)`,
      ).bind(
        run.run_id,
        roundRow.round,
        stage,
        candidate.candidate_id,
        workProduct?.head_sha ?? null,
        now,
        now,
      )),
      this.env.DB.prepare(
        `UPDATE provider_operations SET state = 'succeeded', provider_resource_id = ?,
                updated_at = ?, completed_at = ?
         WHERE operation_id = ? AND state = 'pending'`,
      ).bind(`round:${roundRow.round}`, now, now, operationId),
    ]);
    if (results.some((result) => (result.meta.changes ?? 0) !== 1)) {
      throw new Error("trace review round start compare-and-set failed");
    }
    return { kind: "system_action" as const, outcome: "completed" as const, providerReceiptsComplete: true };
  }

  ensureHumanGate(run: OrchestrationRunRecord, node: HumanGateWorkflowNode) {
    return this.linear.ensureHumanGate(run, node);
  }

  async restoreHumanGate(
    run: OrchestrationRunRecord,
    node: HumanGateWorkflowNode,
    deliveryId: string,
  ) {
    const event = await this.orchestration.findInboxEvent(deliveryId);
    if (event === null) throw new Error("human-gate repair event is missing");
    return this.linear.restoreHumanGate(run, node, event);
  }

  observeHumanGateDelivery(
    _run: OrchestrationRunRecord,
    _node: HumanGateWorkflowNode,
    operation: Parameters<WorkflowNodeServices["observeHumanGateDelivery"]>[2],
    event: Parameters<WorkflowNodeServices["observeHumanGateDelivery"]>[3],
  ) {
    return this.linear.observeHumanGateDelivery(operation, event);
  }

  private async syncTraceReviewProviders(input: {
    run: OrchestrationRunRecord;
    reviewId: string;
    stage: "self_check" | "independent";
    outcome: string;
    findingCount: number;
    confirmedLinkCount: number;
    disputedLinkCount: number;
    headSha: string | null;
    authorResponse?: { applied: number; declined: number; no_change: number };
  }): Promise<boolean> {
    const detailsUrl = `${this.env.PORTAL_BASE_URL.replace(/\/$/, "")}/runs/${encodeURIComponent(input.run.run_id)}/review`;
    const operations = new D1SystemActionStore(this.env.DB);
    const now = new Date().toISOString();
    let complete = true;
    if (input.headSha !== null) {
      const workProduct = await new D1PlanningStore(this.env.DB).findRunWorkProduct(input.run.run_id);
      if (workProduct !== null && workProduct.head_sha === input.headSha) {
        const operationId = operationIdentity(
          input.run.run_id,
          "system_action",
          `trace-review-check:${input.authorResponse ? "author-response:" : ""}${input.reviewId}`,
          1,
        );
        const operation = await operations.beginPlanningOperation({
          operationId,
          runId: input.run.run_id,
          action: "github.upsert_trace_review_check",
          requestDigest: await sha256Hex(JSON.stringify({
            reviewId: input.reviewId,
            headSha: input.headSha,
            outcome: input.outcome,
            findingCount: input.findingCount,
            confirmedLinkCount: input.confirmedLinkCount,
            disputedLinkCount: input.disputedLinkCount,
            authorResponse: input.authorResponse ?? null,
            detailsUrl,
          })),
          now,
        });
        if (operation.state === "pending") {
          try {
            const receipt = await githubForRun(this.env, input.run).upsertTraceReviewCheck({
              repository: workProduct.repository,
              headSha: input.headSha,
              externalId: `deos-trace:${input.run.run_id}:${input.stage}`,
              detailsUrl,
              title: input.stage === "independent"
                ? input.authorResponse ? "Independent review and author response complete" : "Independent review complete"
                : `Codex self-check: ${input.outcome}`,
              summary: input.stage === "independent"
                ? input.authorResponse
                  ? `${input.findingCount} concern(s): ${input.authorResponse.applied} applied, ${input.authorResponse.declined} declined, and ${input.authorResponse.no_change} needed no text change. Human review is ready. Full proof is in the protected DEOS portal.`
                  : `${input.findingCount} concern(s): ${input.confirmedLinkCount} confirmed relationship(s) and ${input.disputedLinkCount} directional disagreement(s). The author will respond before human review. Full proof is in the protected DEOS portal.`
                : `${input.findingCount} finding(s). Full proof is in the protected DEOS portal.`,
              conclusion: input.stage === "independent"
                ? "success"
                : input.outcome === "pass" ? "success" : input.outcome === "findings" ? "failure" : "neutral",
            });
            await operations.finishPlanningOperation({
              operationId,
              expected: "pending",
              state: receipt.reconciled ? "reconciled" : "succeeded",
              providerResourceId: receipt.checkRunId,
              safeErrorCategory: null,
              now: new Date().toISOString(),
            });
          } catch {
            complete = false;
            await operations.finishPlanningOperation({
              operationId,
              expected: "pending",
              state: "manual_reconciliation_required",
              providerResourceId: null,
              safeErrorCategory: "trace_review_check_unconfirmed",
              now: new Date().toISOString(),
            });
          }
        } else if (!["succeeded", "reconciled"].includes(operation.state)) {
          complete = false;
        }
      }
    }
    const linearOperationId = operationIdentity(
      input.run.run_id,
      "system_action",
      `trace-review-portal-link:${input.reviewId}`,
      input.authorResponse ? 2 : 1,
    );
    const linearOperation = await operations.beginPlanningOperation({
      operationId: linearOperationId,
      runId: input.run.run_id,
      action: "linear.upsert_trace_review_link",
      requestDigest: await sha256Hex(JSON.stringify({
        issueId: input.run.issue_id,
        detailsUrl,
        authorResponse: input.authorResponse ?? null,
      })),
      now,
    });
    if (linearOperation.state === "pending") {
      try {
        const receipt = await new LinearCapabilityAdapter(
          this.env.LINEAR_API_URL,
          this.env.LINEAR_APP_ACCESS_TOKEN,
        ).upsertStatus({
          issueId: input.run.issue_id,
          markerId: `trace-review:${input.run.run_id}`,
          body: input.stage === "independent"
            ? input.authorResponse
              ? `DEOS traceability review: independent review and author response are complete. ${input.authorResponse.applied} concern(s) applied, ${input.authorResponse.declined} declined, and ${input.authorResponse.no_change} needed no text change. Human review is ready. [View the protected trace](${detailsUrl}).`
              : `DEOS traceability review: independent review is complete with ${input.findingCount} concern(s). The author response will be added before human review. [View the protected trace](${detailsUrl}).`
            : `DEOS traceability review: Codex self-check is ${input.outcome}. [View the protected trace](${detailsUrl}).`,
        });
        await operations.finishPlanningOperation({
          operationId: linearOperationId,
          expected: "pending",
          state: receipt.reconciled ? "reconciled" : "succeeded",
          providerResourceId: receipt.commentId,
          safeErrorCategory: null,
          now: new Date().toISOString(),
        });
      } catch {
        complete = false;
        await operations.finishPlanningOperation({
          operationId: linearOperationId,
          expected: "pending",
          state: "manual_reconciliation_required",
          providerResourceId: null,
          safeErrorCategory: "trace_review_linear_link_unconfirmed",
          now: new Date().toISOString(),
        });
      }
    } else if (!["succeeded", "reconciled"].includes(linearOperation.state)) {
      complete = false;
    }
    return complete;
  }

  private async capabilityGrant(
    attemptId: string,
    runId: string,
    job: import("./workflow-definition.ts").WorkflowJob,
    repository: string,
    changeId: string,
    planningBranch: string | null,
  ) {
    const run = await this.orchestration.findRun(runId);
    if (run === null) throw new Error("capability run is missing");
    if (run.route_repository !== repository) {
      throw new Error("capability repository does not match the frozen run");
    }
    if (run.route_github_installation_id === null || run.route_github_installation_id === undefined) {
      throw new Error("capability GitHub App installation is missing from the frozen run");
    }
    const planning = job.capabilities?.includes("github.publish_planning_work_product") === true;
    const explicitlyBound = job.agentRole !== undefined;
    const workActions: readonly CapabilityAction[] = planning
      ? ["github.publish_planning_work_product"]
      : job.providerAccess?.includes("model.openrouter_review") === true
        ? ["model.openrouter_review"]
        : explicitlyBound ? [] : ["github.publish_work_product", "linear.upsert_working_note"];
    const actions: readonly CapabilityAction[] = ["github.clone_repository", ...workActions];
    if (planning) {
      const workProduct = await new D1PlanningStore(this.env.DB).findRunWorkProduct(runId);
      if (
        workProduct === null ||
        workProduct.repository !== repository ||
        workProduct.change_id !== changeId ||
        workProduct.remote_branch !== planningBranch
      ) throw new Error("planning capability identity mismatch");
    }
    const token = await mintCapabilityToken({
      version: 1,
      issuer: "deos",
      audience: "sandbox-capabilities",
      attemptId,
      runId,
      repository,
      issueId: run.issue_id,
      actions,
      changeId: planning ? changeId : null,
      planningBranch: planning ? planningBranch : null,
      ...(actions.includes("model.openrouter_review") ? {
        modelProvider: "openrouter" as const,
        model: job.model ?? null,
        reasoning: job.reasoning ?? null,
      } : {}),
      expiresAt: Math.floor(Date.now() / 1000) + 25 * 60 * 60,
    }, this.env.CAPABILITY_SIGNING_SECRET);
    return { url: this.env.CAPABILITY_BASE_URL.replace(/\/$/, ""), token };
  }
}
