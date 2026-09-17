import { D1PlanningStore } from "./planning-store.ts";
import { ImplementationDemoService } from './implementation-demo.ts';
import { ImplementationHostedPreview } from './implementation-hosted-preview.ts';
import { ImplementationEnvironment } from './implementation-environment.ts';
import { publishImplementationProof, implementationProofMarkdown, type PublishedImplementationProof } from './implementation-pr-proof.ts';
import { D1DesignStore } from "./design-store.ts";
import {
  D1OrchestrationStore,
  type OrchestrationRunRecord,
  type WorkflowInboxRecord,
} from "./orchestration-store.ts";
import { LinearCapabilityAdapter } from "./linear-capability.ts";
import { sha256Hex } from "./implementation-hash.ts";
import { recordCaughtError } from "./error-context.ts";
import { saveImplementationProgress } from "./implementation-progress.ts";
import { readImplementationTaskProgress } from "./implementation-progress-reader.ts";
import { ensureImplementationProgressWatcher } from "./implementation-progress-watcher.ts";
import { CloudflareBrowserProvider, ImplementationBrowserAllocator } from "./implementation-browser.ts";
import {
  ImplementationStore,
  type ImplementationInput,
  type ImplementationRun,
} from "./implementation-store.ts";
import {
  implementationGitHub,
  type ImplementationPull,
} from "./implementation-github.ts";
import {
  BaseChangedError,
  ImplementationError,
  implementationBranch,
  type ImplementationCandidate,
  type ProofRequirement,
} from "./implementation-contract.ts";
import type {
  LoadedWorkflowDefinition,
  WorkflowJob,
  HumanGateWorkflowNode,
} from "./workflow-definition.ts";
import type { MaterializedJobInput } from "./job-inputs.ts";
import type { AgentAttemptRecord, SandboxView } from "./sandbox-controller.ts";
import type {
  EdgeDecision,
  ValidatedSystemOutcome,
} from "./workflow-evaluator.ts";

const completed = (): ValidatedSystemOutcome => ({
  kind: "system_action",
  outcome: "completed",
  providerReceiptsComplete: true,
});
export class ImplementationService {
  readonly store: ImplementationStore;
  readonly env: Env;
  readonly definition: LoadedWorkflowDefinition;
  constructor(env: Env, definition: LoadedWorkflowDefinition) {
    this.env = env;
    this.definition = definition;
    this.store = new ImplementationStore(env.DB, env.ARTIFACTS);
  }
  async execute(
    run: OrchestrationRunRecord,
    action: string,
  ): Promise<ValidatedSystemOutcome> {
    try {
      if (action === "implementation.prepare") await this.prepare(run);
      else if (action === "implementation.rebase") await this.rebase(run);
      else if (action === "implementation.resume") {
        const plan = await new ImplementationDemoService(this.env.DB, this.env.ARTIFACTS).latest(run.run_id, 'plan');
        return {kind:'system_action', outcome:plan?.outcome === 'ready' ? 'completed' : 'plan_required', providerReceiptsComplete:true};
      }
      else {
        const work = await this.store.requireRun(run.run_id);
        if (action === "implementation.question")
          await this.postQuestion(run, work);
        else if (action === "implementation.publication_question")
          await this.postPublicationQuestion(run, work);
        else if (
          action === "implementation.merge_recheck" ||
          action === "implementation.merge"
        )
          await this.merge(run, work, action === "implementation.merge");
        else {
          const candidate = await this.store.candidate(work);
          if (action === "implementation.check_proof") {
            if (this.singleDemoRepair() && await new ImplementationDemoService(this.env.DB, this.env.ARTIFACTS).handoff(work))
              return {kind:'system_action',outcome:'review_ready',providerReceiptsComplete:true};
            return completed();
          }
          const github = implementationGitHub(this.env, run);
          if (action === "implementation.write_branch")
            await github.writeBranch(this.store, work, candidate);
          else if (action === "implementation.publish") {
            await github.publish(
              this.store,
              work,
              await this.prBody(work, await publishImplementationProof(github, this.store, work, candidate)),
              work.candidate_sha!,
            );
            await new ImplementationEnvironment(this.env).cleanupRun(work.run_id);
          }
          else if (
            action === "implementation.merge_recheck" ||
            action === "implementation.merge"
          )
            await this.merge(run, work, action === "implementation.merge");
          else
            throw new ImplementationError(
              "unknown_action",
              `Unknown implementation action: ${action}`,
            );
        }
      }
      return completed();
    } catch (error) {
      if (error instanceof BaseChangedError) {
        await this.invalidate(run);
        return {
          kind: "system_action",
          outcome: "base_changed",
          providerReceiptsComplete: true,
        };
      }
      try {
        await this.store.error(run.run_id, null, action, error);
      } catch (secondary) {
        recordCaughtError(secondary, "implementation.diagnostics");
        throw new AggregateError(
          [error, secondary],
          "Implementation action and diagnostic storage failed",
          { cause: error },
        );
      }
      return {
        kind: "system_action",
        outcome: "failed",
        providerReceiptsComplete: false,
      };
    }
  }
  async prepare(run: OrchestrationRunRecord) {
    const existing = await this.store.run(run.run_id);
    if (existing) return existing;
    if (
      !run.allowed_linear_user_id ||
      !run.human_binding_revision ||
      !this.definition.implementationPolicy
    )
      throw new ImplementationError(
        "human_binding_missing",
        "Implementation requires a checked, frozen human binding and policy",
      );
    const plan = await new D1PlanningStore(this.env.DB).findRunWorkProduct(
      run.run_id,
    );
    const design = await new D1DesignStore(this.env.DB).findWorkProduct(
      run.run_id,
    );
    if (
      !plan?.verified_merge_commit_sha ||
      plan.verified_merge_commit_sha !== plan.merge_commit_sha ||
      !plan.verification_manifest_json ||
      !plan.verification_manifest_digest ||
      !plan.planning_manifest_json ||
      !design?.merge_commit_sha ||
      !design.merge_operation_id ||
      !design.design_manifest_json ||
      !design.design_manifest_digest
    )
      throw new ImplementationError(
        "design_not_verified",
        "The approved planning and design merge receipts are incomplete",
      );
    if (
      (await sha256Hex(plan.verification_manifest_json)) !==
        plan.verification_manifest_digest ||
      (await sha256Hex(design.design_manifest_json)) !==
        design.design_manifest_digest
    )
      throw new ImplementationError(
        "design_manifest_hash",
        "Approved planning or design receipt hash differs",
      );
    const gate = await this.env.DB.prepare(
      "SELECT * FROM human_gate_visits WHERE run_id=? AND gate_kind='design' AND state='merge_authorized' ORDER BY visit_sequence DESC LIMIT 1",
    )
      .bind(run.run_id)
      .first<{ decision_delivery_id: string; approved_head_sha: string }>();
    if (!gate)
      throw new ImplementationError(
        "design_gate_missing",
        "No saved human design merge event",
      );
    const event = await new D1OrchestrationStore(this.env.DB).findInboxEvent(
      gate.decision_delivery_id,
    );
    if (
      event?.actor_id !== run.allowed_linear_user_id ||
      event.actor_type !== "user"
    )
      throw new ImplementationError(
        "design_actor",
        "Design merge was not chosen by the frozen human",
      );
    const github = implementationGitHub(this.env, run);
    const pull = await github.json<ImplementationPull>(
      `/pulls/${design.pull_request_number}`,
    );
    if (
      !pull.merged ||
      pull.merge_commit_sha !== design.merge_commit_sha ||
      pull.head.sha !== gate.approved_head_sha
    )
      throw new ImplementationError(
        "design_merge_readback",
        "Design PR merge read-back does not match approved work",
      );
    const base = (await github.ref("main"))!;
    await github.reachable(design.merge_commit_sha, base);
    const approvedFiles = [];
    for (const file of [
      ...JSON.parse(plan.planning_manifest_json),
      ...JSON.parse(design.design_manifest_json),
    ] as { path: string; sha256: string }[]) {
      const content = await github.file(file.path, base);
      if ((await sha256Hex(content)) !== file.sha256)
        throw new ImplementationError(
          "approved_file_hash",
          `Approved file hash differs on base: ${file.path}`,
        );
      approvedFiles.push({ ...file, content });
    }
    const issue = await new LinearCapabilityAdapter(
      this.env.LINEAR_API_URL,
      this.env.LINEAR_APP_ACCESS_TOKEN,
    ).implementationContext(run.issue_id);
    if (typeof issue.identifier !== "string")
      throw new ImplementationError(
        "issue_identity",
        "Issue identifier is missing",
      );
    const branch = implementationBranch(issue.identifier, run.run_sequence);
    const requirements: ProofRequirement = { kinds: [], reasons: [], blockedProviders: [] };
    const input: ImplementationInput = {
      version: 1,
      runId: run.run_id,
      repository: run.route_repository!,
      change: design.change_id,
      branch,
      approvedDesignSha: design.merge_commit_sha,
      testedBaseSha: base,
      policy: this.definition.implementationPolicy,
      approvedFiles,
      issue: {
        ...issue,
        projectId: run.project_id,
        trust: "untrusted provider data",
      },
      receipts: {
        planning: JSON.parse(plan.verification_manifest_json),
        design: {
          pullRequest: pull.number,
          mergeSha: pull.merge_commit_sha,
          head: pull.head.sha,
          decisionDeliveryId: gate.decision_delivery_id,
        },
      },
      requirements,
    };
    return this.store.allocate(
      input,
      {
        userId: run.allowed_linear_user_id,
        revision: run.human_binding_revision,
      },
      issue.identifier,
      run.run_sequence,
    );
  }
  async materialize(
    run: OrchestrationRunRecord,
    job: WorkflowJob,
  ): Promise<MaterializedJobInput> {
    const work = await this.store.requireRun(run.run_id);
    await implementationGitHub(this.env, run).current(work);
    const input = await this.store.read<ImplementationInput>(
      work.input_key,
      work.input_sha,
    );
    const question = await this.store.question(run.run_id);
    const reply =
      question?.reply_key && question.reply_sha
        ? await this.store.read(question.reply_key, question.reply_sha)
        : null;
    const recovered = await this.store.failedCandidate(work, job.id);
    const prior = recovered?.candidate ?? (
      work.candidate_key && work.candidate_sha
        ? await this.store.candidate(work)
        : null);
    const issue = await new LinearCapabilityAdapter(
      this.env.LINEAR_API_URL,
      this.env.LINEAR_APP_ACCESS_TOKEN,
    ).implementationContext(run.issue_id);
    const feedback = work.pr_number
      ? await implementationGitHub(this.env, run).feedback(work.pr_number)
      : null;
    const demoEnabled = !!this.definition.jobs.implementation_demo_plan;
    const demo = demoEnabled && job.id === 'implementation_build'
      ? await new ImplementationDemoService(this.env.DB, this.env.ARTIFACTS).buildInput(run.run_id) : null;
    const hostedPreview = await new ImplementationHostedPreview(this.env).latest(work);
    return {
      context: JSON.stringify({
        ...input,
        issue: { ...issue, trust: "untrusted provider data" },
        implementationReviewFeedback: feedback,
        ...(demo ? { demo } : {}),
        ...(hostedPreview ? { hostedPreview } : {}),
        testedBaseSha: work.tested_base_sha,
        requirements: JSON.parse(work.requirements_json),
        prior,
        priorFailure: recovered?.failure ?? null,
        question: question
          ? await this.store.read(question.question_key, question.question_sha)
          : null,
        reply,
        clarifications: await this.store.clarifications(run.run_id),
        patchBaseSha: recovered?.candidate.testedBaseSha ?? work.patch_base_sha,
      }),
      repository: input.repository,
      openspecChange: input.change,
      continuationPatch: recovered?.patch ?? (
        work.patch_key && work.patch_sha
          ? {
              attemptId: work.source_attempt_id!,
              manifestId: work.candidate_sha!,
              r2Key: work.patch_key,
              sha256: work.patch_sha,
            }
          : null),
      planningWorkProduct: null,
      designWorkProduct: null,
      checkoutCommit: work.tested_base_sha,
    };
  }
  async start(
    run: OrchestrationRunRecord,
    attempt: AgentAttemptRecord,
    job: WorkflowJob,
    sandbox: SandboxView,
  ) {
    const work = await this.store.requireRun(run.run_id);
    const durable = JSON.parse(attempt.job_spec_json) as {
      materializedContext: string;
      continuationPatch?: {sha256: string} | null;
    };
    await this.store.beginTry(
      work,
      attempt,
      job.id === "implementation_tasks" ? "tasks" : "build",
      durable.continuationPatch?.sha256 ?? null,
    );
    const context = JSON.parse(durable.materializedContext);
    await sandbox.writeFile(
      "/deos/run/issue-context.json",
      JSON.stringify(context.issue),
      { encoding: "utf8" },
    );
    const { issue: _issue, ...manifest } = context;
    await sandbox.writeFile(
      "/deos/run/implementation-input.json",
      JSON.stringify({
        ...manifest,
        issueContextPath: "/deos/run/issue-context.json",
      }),
      { encoding: "utf8" },
    );
    const resource = await this.store.allocateResource(
      run.run_id,
      attempt.attempt_id,
      "local_data",
      "workerd",
    );
    const persist = `/deos/test-data/${attempt.attempt_id}`;
    await sandbox.mkdir(persist, { recursive: true });
    await this.env.DB.prepare(
      "UPDATE implementation_resources SET status='ready',namespace=?,local_persist_path=?,updated_at=? WHERE resource_id=? AND status='allocating'",
    )
      .bind(
        `${run.run_id}:${attempt.attempt_id}`,
        persist,
        new Date().toISOString(),
        resource.resource_id,
      )
      .run();
  }
  async progress(run: OrchestrationRunRecord, attempt: AgentAttemptRecord, sandbox: SandboxView) {
    try {
      await new ImplementationBrowserAllocator(this.store, new CloudflareBrowserProvider(this.env.IMPLEMENTATION_BROWSER))
        .keepAlive(run.run_id, attempt.attempt_id);
    } catch (error) {
      // Maintenance never repeats a browser action or substitutes for proof.
      // Preserve failure without interrupting source work still in progress.
      recordCaughtError(error, `implementation.browser.keepAlive:${attempt.attempt_id}`);
      try { await this.store.error(run.run_id, attempt.attempt_id, "browser.keepAlive", error); }
      catch (secondary) { recordCaughtError(secondary, "implementation.browser.keepAlive.diagnostics"); }
    }
    try { await ensureImplementationProgressWatcher(sandbox, attempt.absolute_deadline); }
    catch (error) {
      recordCaughtError(error, `implementation.progress.watch:${attempt.attempt_id}`);
      try { await this.store.error(run.run_id, null, `progress.watch:${attempt.attempt_id}`, error); }
      catch (secondary) { recordCaughtError(secondary, "implementation.progress.watch.diagnostics"); }
    }
    try {
      const work = await this.store.requireRun(run.run_id);
      const observedAt = new Date().toISOString();
      const counts = await readImplementationTaskProgress(sandbox, work.change_id);
      if (counts) {
        // Keep the checklist and meter on the same immutable observation. Store
        // and verify its bytes before publishing the digest/counts in D1.
        await this.store.put(run.run_id, "task-progress.md", counts.tasks, "text/markdown; charset=utf-8");
        await saveImplementationProgress(this.env.DB, {
          ...counts, runId:run.run_id, attemptId:attempt.attempt_id, testedBaseSha:work.tested_base_sha, observedAt,
        });
      }
    } catch (error) {
      // Optional observation cannot fail otherwise healthy author work. Preserve
      // the original error separately; the old observation visibly becomes stale.
      recordCaughtError(error, `implementation.progress:${attempt.attempt_id}`);
      try { await this.store.error(run.run_id, null, `progress.read:${attempt.attempt_id}`, error); }
      catch (secondary) { recordCaughtError(secondary, "implementation.progress.diagnostics"); }
    }
  }
  async collect(
    run: OrchestrationRunRecord,
    attempt: AgentAttemptRecord,
    sandbox: SandboxView,
  ) {
    const work = await this.store.requireRun(run.run_id);
    const candidate = JSON.parse(
      (
        await sandbox.readFile("/deos/output/implementation-candidate.json", {
          encoding: "utf8",
        })
      ).content,
    ) as ImplementationCandidate;
    const patch = (
      await sandbox.readFile("/deos/output/patch.diff", { encoding: "utf8" })
    ).content;
    // Store the author's output, including failed checks and incomplete tasks.
    // Claude and the human reviewer receive those facts without a quality gate.
    await this.store.checkpoint(work, candidate, patch);
    const question = await this.store.question(run.run_id);
    if (
      question?.status === "answered" &&
      candidate.question?.blockKey !== question.block_key
    )
      await this.env.DB.prepare(
        "UPDATE implementation_questions SET status='closed' WHERE question_id=? AND status='answered'",
      )
        .bind(question.question_id)
        .run();
  }
  singleDemoRepair() {
    return this.definition.nodes.implementation_proof_check?.edges.review_ready === 'implementation_branch_write';
  }
  async prBody(work: ImplementationRun, proof: PublishedImplementationProof) {
    const input = await this.store.read<ImplementationInput>(
      work.input_key,
      work.input_sha,
    );
    const [plan, design] = await Promise.all([
      new D1PlanningStore(this.env.DB).findRunWorkProduct(work.run_id),
      new D1DesignStore(this.env.DB).findWorkProduct(work.run_id),
    ]);
    const pullLink = (number: number | null | undefined) => number
      ? `[PR #${number}](https://github.com/${input.repository}/pull/${number})` : 'Not recorded';
    const preview = await new ImplementationHostedPreview(this.env).latest(work);
    const remote = await this.env.DB.prepare('SELECT name FROM implementation_environments WHERE run_id=? LIMIT 1').bind(work.run_id).first();
    return [
      `${input.issue.title}\n\nImplements the approved design. Live release has not begun.`,
      `Linear: [${work.linear_identifier}](${input.issue.url})`,
      `Approved Proposal and Specs: ${pullLink(plan?.pull_request_number)}`,
      `Approved design: ${pullLink(design?.pull_request_number)}`,
      ...(preview ? [`Preview: [Open the web app](${preview.deployment.url})${preview.subject.treeSha === work.tree_sha ? '' : ' (published from an earlier repository snapshot; later edits may include checklist or source changes)'}`] : []),
      ...(remote ? ['The temporary Worker, D1 and R2 test environment is retired after publication. Screenshots and test evidence remain available here; no live review preview is retained.'] : []),
      'Proof:',
      ...implementationProofMarkdown(proof),
      `This is the [Showboat file](${proof.showboatUrl}).`,
    ].join("\n\n");
  }
  async invalidate(run: OrchestrationRunRecord) {
    await this.env.DB.batch([
      this.env.DB.prepare(
        "UPDATE implementation_runs SET status='stale',updated_at=? WHERE run_id=?",
      ).bind(new Date().toISOString(), run.run_id),
      this.env.DB.prepare(
        "UPDATE implementation_gates SET state=CASE WHEN decision_outcome='merge_authorized' THEN 'merge_choice_not_executed_stale_subject' ELSE 'stale' END WHERE run_id=? AND state IN ('open','merge_authorized')",
      ).bind(run.run_id),
    ]);
  }
  async rebase(run: OrchestrationRunRecord) {
    const work = await this.store.requireRun(run.run_id);
    const github = implementationGitHub(this.env, run);
    const base = (await github.ref("main"))!;
    await github.reachable(work.approved_design_sha, base);
    await github.current({ ...work, tested_base_sha: base });
    await this.invalidate(run);
    await this.env.DB.prepare(
      "UPDATE implementation_runs SET tested_base_sha=?,status='build',updated_at=? WHERE run_id=?",
    )
      .bind(base, new Date().toISOString(), run.run_id)
      .run();
  }
  async postPublicationQuestion(run: OrchestrationRunRecord, work: ImplementationRun) {
    const operation = run.previous_node === 'implementation_branch_write'
      ? 'implementation.write_branch' : run.previous_node === 'implementation_publish'
        ? 'implementation.publish' : null;
    if (!operation) throw new ImplementationError('publication_block_source', 'Publication blocker has no failed publication step');
    const saved = await this.env.DB.prepare(`SELECT r2_key,sha256 FROM implementation_effect_errors
      WHERE run_id=? AND operation=? ORDER BY created_at DESC LIMIT 1`)
      .bind(run.run_id,operation).first<{r2_key:string;sha256:string}>();
    if (!saved) throw new ImplementationError('publication_block_error_missing', 'Original publication error is missing');
    const diagnostic = await this.store.read<{error:{message?:string}}>(saved.r2_key,saved.sha256);
    await this.postQuestion(run,work,{
      blockKey:`publication-${run.current_visit_sequence}`,
      question:'The implementation is saved, but I could not publish it for review. How would you like me to proceed?',
      reason:`${diagnostic.error.message ?? 'The publication request failed; the original diagnostic is saved.'}\n\nYou can ask me to change what is published, or resolve the access problem and ask me to try again. Your reply will go to the implementation agent with the saved code and evidence.`,
    });
  }
  async postQuestion(run: OrchestrationRunRecord, work: ImplementationRun, publicationQuestion?: ImplementationCandidate['question']) {
    const question = publicationQuestion ?? (run.previous_node?.startsWith('implementation_demo_')
      ? await new ImplementationDemoService(this.env.DB, this.env.ARTIFACTS).blocker(run)
      : (await this.store.candidate(work)).question);
    if (!question)
      throw new ImplementationError(
        "question_missing",
        "Implementation blocker question missing",
      );
    const prior = await this.store.question(run.run_id);
    if (prior && prior.block_key !== question.blockKey)
      throw new ImplementationError(
        "question_conflict",
        "A different implementation block is still open",
      );
    const object = await this.store.put(
      run.run_id,
      "question.json",
      JSON.stringify(question),
    );
    const id = `${run.run_id}:${question.blockKey}`;
    await this.env.DB.prepare(
      `INSERT INTO implementation_questions
      (question_id,run_id,block_key,gate_visit,opened_delivery_id,opened_at,question_key,question_sha,status)
      VALUES (?,?,?,?,?,?,?,?,'open') ON CONFLICT(question_id) DO NOTHING`,
    )
      .bind(
        id,
        run.run_id,
        question.blockKey,
        run.current_visit_sequence + 1,
        run.selection_delivery_id,
        new Date().toISOString(),
        object.key,
        object.sha256,
      )
      .run();
    const note = await new LinearCapabilityAdapter(
      this.env.LINEAR_API_URL,
      this.env.LINEAR_APP_ACCESS_TOKEN,
    ).upsertNote(
      {
        issueId: run.issue_id,
        body: `${question.question}\n\n${question.reason}\n\nReply here to continue implementation.`,
      },
      id,
    );
    await this.env.DB.prepare(
      "UPDATE implementation_questions SET linear_comment_id=?,status='open',gate_visit=? WHERE question_id=?",
    )
      .bind(note.commentId, run.current_visit_sequence + 1, id)
      .run();
  }
  async bindGate(run: OrchestrationRunRecord, node: HumanGateWorkflowNode) {
    const work = await this.store.requireRun(run.run_id);
    const kind = node.expectedEventKind!;
    const question =
      kind === "comment" ? await this.store.question(run.run_id) : null;
    if (
      kind === "state" &&
      (!work.pr_head_sha || !work.pr_number || !work.tree_sha)
    )
      throw new ImplementationError(
        "gate_subject_missing",
        "Published implementation subject is missing",
      );
    if (kind === "comment" && !question?.linear_comment_id)
      throw new ImplementationError(
        "question_unpublished",
        "Clarification question is not read back",
      );
    await this.env.DB.prepare(
      `INSERT OR IGNORE INTO implementation_gates
      (run_id,visit_sequence,node_id,expected_event_kind,allowed_linear_user_id,issue_id,human_state_id,question_id,pr_number,head_sha,base_sha,opened_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
      .bind(
        run.run_id,
        run.current_visit_sequence,
        node.id,
        kind,
        work.allowed_linear_user_id,
        run.issue_id,
        run.route_human_gate_state_id,
        question?.question_id ?? null,
        work.pr_number,
        work.pr_head_sha,
        work.tested_base_sha,
        new Date().toISOString(),
      )
      .run();
    const saved = await this.store.gate(run.run_id, run.current_visit_sequence);
    if (!saved || saved.expected_event_kind !== kind)
      throw new ImplementationError(
        "gate_conflict",
        "Implementation gate binding differs",
      );
  }
  async gateDecision(
    run: OrchestrationRunRecord,
    node: HumanGateWorkflowNode,
    event: WorkflowInboxRecord,
  ): Promise<EdgeDecision> {
    const gate = await this.store.gate(run.run_id, run.current_visit_sequence);
    if (!gate || gate.state !== "open")
      return { kind: "wait", reason: "unrelated_event" };
    const record = async (decision: string) =>
      this.env.DB.prepare(
        "INSERT OR IGNORE INTO implementation_gate_events VALUES (?,?,?,?,?)",
      )
        .bind(
          event.delivery_id,
          run.run_id,
          run.current_visit_sequence,
          decision,
          new Date().toISOString(),
        )
        .run();
    const repair = (): EdgeDecision => ({
      kind: "repair_gate",
      nodeId: node.id,
      linearState: node.linearState,
      deliveryId: event.delivery_id,
      actorId: event.actor_id,
      actorType: event.actor_type,
    });
    if (
      event.event_kind === "implementation_base_changed" &&
      node.edges.base_changed
    ) {
      if (
        (await implementationGitHub(this.env, run).ref("main")) ===
        gate.base_sha
      )
        return { kind: "wait", reason: "unrelated_event" };
      await this.invalidate(run);
      return {
        kind: "transition",
        fromNode: node.id,
        toNode: node.edges.base_changed,
        outcome: "base_changed",
        actorId: null,
        actorType: "workflow",
        causeReference: event.delivery_id,
        contractViolation: false,
      };
    }
    const comment = event.event_kind.startsWith("Comment.");
    if (!comment && event.from_state_id !== gate.human_state_id)
      return { kind: "wait", reason: "unrelated_event" };
    if (event.run_id !== gate.run_id)
      return { kind: "wait", reason: "unrelated_event" };
    if ((gate.expected_event_kind === "comment") !== comment) {
      await record("ignored_wrong_event_kind");
      return comment ? { kind: "wait", reason: "unrelated_event" } : repair();
    }
    if (
      event.actor_type !== "user" ||
      event.actor_id !== gate.allowed_linear_user_id ||
      Date.parse(event.provider_time) <= Date.parse(gate.opened_at)
    ) {
      await record("untrusted_or_old_event");
      return comment ? { kind: "wait", reason: "unrelated_event" } : repair();
    }
    let outcome: string;
    if (comment) {
      const question = await this.store.question(run.run_id);
      if (
        event.event_kind !== "Comment.create" ||
        !event.comment_id ||
        !question
      ) {
        await record("comment_not_new");
        return { kind: "wait", reason: "unrelated_event" };
      }
      const reply = await new LinearCapabilityAdapter(
        this.env.LINEAR_API_URL,
        this.env.LINEAR_APP_ACCESS_TOKEN,
      ).readImplementationComment(event.comment_id);
      if (
        reply.issue?.id !== gate.issue_id ||
        reply.user?.id !== gate.allowed_linear_user_id ||
        reply.editedAt ||
        reply.archivedAt ||
        Date.parse(reply.createdAt) <= Date.parse(question.opened_at) ||
        Date.parse(reply.createdAt) !== Date.parse(event.provider_time)
      ) {
        await record("comment_provenance_failed");
        return { kind: "wait", reason: "unrelated_event" };
      }
      const object = await this.store.put(
        run.run_id,
        "accepted-reply.json",
        JSON.stringify(reply),
      );
      await this.env.DB.prepare(
        `UPDATE implementation_questions SET status='answered',answer_delivery_id=?,answer_comment_id=?,answer_actor_id=?,reply_key=?,reply_sha=? WHERE question_id=? AND status='open'`,
      )
        .bind(
          event.delivery_id,
          reply.id,
          reply.user.id,
          object.key,
          object.sha256,
          question.question_id,
        )
        .run();
      outcome = "reply_received";
    } else {
      if (event.from_state_id !== gate.human_state_id) {
        await record("wrong_prior_state");
        return { kind: "wait", reason: "unrelated_event" };
      }
      outcome =
        Object.entries(node.decisions ?? {}).find(
          ([, state]) => state === event.to_state_name,
        )?.[0] ?? "";
      if (!outcome) {
        await record("unknown_state");
        return repair();
      }
    }
    await record("eligible");
    return {
      kind: "transition",
      fromNode: node.id,
      toNode: node.edges[outcome],
      outcome,
      actorId: event.actor_id,
      actorType: "user",
      causeReference: event.delivery_id,
      contractViolation: false,
    };
  }
  async merge(
    run: OrchestrationRunRecord,
    work: ImplementationRun,
    execute: boolean,
  ) {
    const gate = await this.env.DB.prepare(
      "SELECT * FROM implementation_gates WHERE run_id=? AND state='merge_authorized' ORDER BY visit_sequence DESC LIMIT 1",
    )
      .bind(run.run_id)
      .first<import("./implementation-store.ts").ImplementationGate>();
    if (
      !gate ||
      !gate.decision_delivery_id ||
      gate.head_sha !== work.pr_head_sha ||
      gate.base_sha !== work.tested_base_sha ||
      gate.pr_number !== work.pr_number
    )
      throw new ImplementationError(
        "merge_authority",
        "No current saved human merge choice",
      );
    const event = await new D1OrchestrationStore(this.env.DB).findInboxEvent(
      gate.decision_delivery_id,
    );
    if (
      event?.actor_id !== work.allowed_linear_user_id ||
      event.actor_type !== "user" ||
      event.to_state_name !== "Merging" ||
      event.from_state_id !== gate.human_state_id
    )
      throw new ImplementationError(
        "merge_event",
        "Saved merge event does not match human authority",
      );
    const github = implementationGitHub(this.env, run);
    const pull = await github.json<ImplementationPull>(
      `/pulls/${work.pr_number}`,
    );
    if (
      pull.head.sha !== work.pr_head_sha ||
      pull.head.ref !== work.branch ||
      pull.base.ref !== "main"
    )
      throw new BaseChangedError((await github.ref("main"))!);
    if (!pull.merged) {
      await this.store.candidate(work);
      if (!execute) return;
      await this.store.candidate(work);
      try {
        await github.json(`/pulls/${work.pr_number}/merge`, {
          method: "PUT",
          body: JSON.stringify({
            sha: work.pr_head_sha,
            merge_method: "merge",
          }),
        });
      } catch (error) {
        if (
          !(await github.json<ImplementationPull>(`/pulls/${work.pr_number}`))
            .merged
        )
          throw error;
      }
    }
    const saved = await github.json<ImplementationPull>(
      `/pulls/${work.pr_number}`,
    );
    if (
      !saved.merged ||
      !saved.merge_commit_sha ||
      saved.head.sha !== work.pr_head_sha
    )
      throw new ImplementationError(
        "merge_readback",
        "Implementation merge is unconfirmed",
      );
    await this.env.DB.prepare(
      "UPDATE implementation_runs SET merge_sha=?,status='code_merged',updated_at=? WHERE run_id=?",
    )
      .bind(saved.merge_commit_sha, new Date().toISOString(), work.run_id)
      .run();
  }
}
