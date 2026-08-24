import { operationIdentity } from "./orchestration-identity.ts";
import type {
  OrchestrationRunRecord,
  WorkflowInboxRecord,
} from "./orchestration-store.ts";
import type { HumanGateOperation } from "./workflow-orchestrator.ts";
import type { HumanGateWorkflowNode } from "./workflow-definition.ts";
import type { ValidatedSystemOutcome } from "./workflow-evaluator.ts";

export type ProviderOperationState =
  | "pending"
  | "succeeded"
  | "denied"
  | "failed"
  | "duplicate"
  | "reconciled"
  | "manual_reconciliation_required";

export interface ProviderOperationRecord {
  operation_id: string;
  run_id: string;
  attempt_id: string | null;
  capability: string;
  action: string;
  sanitized_target: string;
  request_digest: string;
  state: ProviderOperationState;
  provider_resource_id: string | null;
  observed_pre_state: string | null;
  provider_updated_at: string | null;
  latest_delivery_id: string | null;
  safe_error_category: string | null;
  diagnostic_id: string | null;
  started_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface LinearOperationStore {
  begin(input: {
    operationId: string;
    runId: string;
    action: "enter_human_gate" | "restore_human_gate" | "delegate_and_start";
    targetStateId: string;
    requestDigest: string;
    observedPreState: string;
    providerUpdatedAt: string;
    latestDeliveryId: string | null;
    now: string;
  }): Promise<{ operation: ProviderOperationRecord; created: boolean }>;
  find(operationId: string): Promise<ProviderOperationRecord | null>;
  setState(
    operationId: string,
    expected: ProviderOperationState,
    next: ProviderOperationState,
    now: string,
    safeErrorCategory?: string | null,
    latestDeliveryId?: string | null,
  ): Promise<boolean>;
}

const changes = (result: D1Result<unknown>): number => result.meta.changes ?? 0;

export class D1LinearOperationStore implements LinearOperationStore {
  private readonly database: D1Database;

  constructor(database: D1Database) {
    this.database = database;
  }

  async begin(input: {
    operationId: string;
    runId: string;
    action: "enter_human_gate" | "restore_human_gate" | "delegate_and_start";
    targetStateId: string;
    requestDigest: string;
    observedPreState: string;
    providerUpdatedAt: string;
    latestDeliveryId: string | null;
    now: string;
  }): Promise<{ operation: ProviderOperationRecord; created: boolean }> {
    const result = await this.database.prepare(
      `INSERT OR IGNORE INTO provider_operations
       (operation_id, run_id, capability, action, sanitized_target, request_digest,
        state, observed_pre_state, provider_updated_at, latest_delivery_id,
        started_at, updated_at)
       VALUES (?, ?, 'linear.transition', ?, ?, ?, 'pending', ?, ?, ?, ?, ?)`,
    ).bind(
      input.operationId,
      input.runId,
      input.action,
      input.targetStateId,
      input.requestDigest,
      input.observedPreState,
      input.providerUpdatedAt,
      input.latestDeliveryId,
      input.now,
      input.now,
    ).run();
    const operation = await this.find(input.operationId);
    if (operation === null) throw new Error("provider operation is not readable");
    if (
      operation.run_id !== input.runId ||
      operation.sanitized_target !== input.targetStateId ||
      operation.request_digest !== input.requestDigest
    ) throw new Error("provider operation identity mismatch");
    return { operation, created: changes(result) === 1 };
  }

  find(operationId: string): Promise<ProviderOperationRecord | null> {
    return this.database.prepare(
      "SELECT * FROM provider_operations WHERE operation_id = ?",
    ).bind(operationId).first<ProviderOperationRecord>();
  }

  async setState(
    operationId: string,
    expected: ProviderOperationState,
    next: ProviderOperationState,
    now: string,
    safeErrorCategory: string | null = null,
    latestDeliveryId: string | null = null,
  ): Promise<boolean> {
    const result = await this.database.prepare(
      `UPDATE provider_operations
       SET state = ?, safe_error_category = ?,
           latest_delivery_id = COALESCE(?, latest_delivery_id), updated_at = ?,
           completed_at = CASE WHEN ? <> 'pending' THEN ? ELSE NULL END
       WHERE operation_id = ? AND state = ?`,
    ).bind(
      next,
      safeErrorCategory,
      latestDeliveryId,
      now,
      next,
      now,
      operationId,
      expected,
    ).run();
    return changes(result) === 1;
  }
}

interface LinearIssueState {
  id: string;
  updatedAt: string;
  delegateId: string | null;
  assigneeId: string | null;
}

interface LinearTransitionConfig {
  apiUrl: string;
  accessToken: string;
  appActorId: string;
  humanGateStateId: string;
  startStateId: string;
  workStateId: string;
}

interface LinearTransitionDependencies {
  fetch: typeof fetch;
  now: () => Date;
}

class LinearGraphqlError extends Error {
  readonly safeCategory: string;

  constructor(safeCategory: string) {
    super("Linear GraphQL request failed");
    this.name = "LinearGraphqlError";
    this.safeCategory = safeCategory;
  }
}

interface LinearGraphqlFailure {
  message?: unknown;
  extensions?: { code?: unknown };
}

const safeLinearErrorCategory = (errors: LinearGraphqlFailure[]): string => {
  if (errors.some((error) => error.message === "App user not valid")) {
    return "linear_delegate_not_assignable";
  }
  const codes = new Set(errors.map((error) => error.extensions?.code));
  if (codes.has("AUTHENTICATION_ERROR")) return "linear_authentication_failed";
  if (codes.has("FORBIDDEN")) return "linear_forbidden";
  if (codes.has("INPUT_ERROR")) return "linear_input_error";
  if (codes.has("RATELIMITED")) return "linear_rate_limited";
  return "linear_graphql_failed";
};

const sha256Hex = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const stateFromOperation = (operation: ProviderOperationRecord): HumanGateOperation["state"] => {
  if (["succeeded", "reconciled", "duplicate"].includes(operation.state)) return "confirmed";
  if (operation.state === "manual_reconciliation_required" || operation.state === "failed") {
    return "manual_reconciliation_required";
  }
  return "awaiting_delivery";
};

export class LinearTransitionController {
  private readonly store: LinearOperationStore;
  private readonly config: LinearTransitionConfig;
  private readonly request: typeof fetch;
  private readonly now: () => Date;

  constructor(
    store: LinearOperationStore,
    config: LinearTransitionConfig,
    dependencies: Partial<LinearTransitionDependencies> = {},
  ) {
    this.store = store;
    this.config = config;
    this.request = dependencies.fetch ?? ((input, init) => fetch(input, init));
    this.now = dependencies.now ?? (() => new Date());
  }

  async ensureHumanGate(
    run: OrchestrationRunRecord,
    node: HumanGateWorkflowNode,
  ): Promise<HumanGateOperation> {
    const operationId = operationIdentity(
      run.run_id,
      node.id,
      "linear-enter-human-gate",
      run.current_visit_sequence,
    );
    const existing = await this.store.find(operationId);
    if (existing !== null) {
      return { providerOperationId: existing.operation_id, state: stateFromOperation(existing) };
    }
    return this.startTransition(
      run,
      node,
      "enter_human_gate",
      operationId,
      null,
      null,
    );
  }

  restoreHumanGate(
    run: OrchestrationRunRecord,
    node: HumanGateWorkflowNode,
    event: WorkflowInboxRecord,
  ): Promise<HumanGateOperation> {
    return this.startTransition(
      run,
      node,
      "restore_human_gate",
      operationIdentity(run.run_id, node.id, `linear-repair:${event.delivery_id}`, 1),
      event.to_state_id,
      event.delivery_id,
    );
  }

  async ensureWorkStarted(
    run: OrchestrationRunRecord,
    nodeId: string,
  ): Promise<ValidatedSystemOutcome> {
    const operationId = operationIdentity(
      run.run_id,
      nodeId,
      "linear-delegate-and-start",
      run.current_visit_sequence,
    );
    const requestDigest = await this.workStartDigest(run.issue_id);
    const existing = await this.store.find(operationId);
    if (
      existing !== null && (
        existing.run_id !== run.run_id ||
        existing.action !== "delegate_and_start" ||
        existing.sanitized_target !== this.config.workStateId ||
        existing.request_digest !== requestDigest
      )
    ) throw new Error("Linear work-start operation identity mismatch");
    const observed = await this.readIssueState(run.issue_id);
    const desired = observed.id === this.config.workStateId &&
      observed.delegateId === this.config.appActorId;
    if (desired) {
      const operation = existing ?? (await this.store.begin({
        operationId,
        runId: run.run_id,
        action: "delegate_and_start",
        targetStateId: this.config.workStateId,
        requestDigest,
        observedPreState: observed.id,
        providerUpdatedAt: observed.updatedAt,
        latestDeliveryId: null,
        now: this.now().toISOString(),
      })).operation;
      if (["pending", "failed", "manual_reconciliation_required"].includes(operation.state)) {
        await this.store.setState(
          operationId,
          operation.state,
          "reconciled",
          this.now().toISOString(),
        );
      }
      return this.workStartCompleted();
    }
    const safeToClaim = observed.id === this.config.startStateId &&
      (observed.delegateId === null || observed.delegateId === this.config.appActorId);
    const operation = existing ?? (await this.store.begin({
      operationId,
      runId: run.run_id,
      action: "delegate_and_start",
      targetStateId: this.config.workStateId,
      requestDigest,
      observedPreState: observed.id,
      providerUpdatedAt: observed.updatedAt,
      latestDeliveryId: null,
      now: this.now().toISOString(),
    })).operation;
    if (["succeeded", "reconciled", "duplicate"].includes(operation.state)) {
      return this.workStartFailed();
    }
    if (!safeToClaim || operation.state === "failed") {
      if (operation.state === "pending" || operation.state === "manual_reconciliation_required") {
        await this.store.setState(
          operationId,
          operation.state,
          "failed",
          this.now().toISOString(),
          "linear_claim_conflict",
        );
      }
      return this.workStartFailed();
    }
    if (operation.state === "manual_reconciliation_required") return this.workStartFailed();
    try {
      const response = await this.graphql(
        `mutation DeosDelegateAndStart($id: String!, $stateId: String!, $delegateId: String!) {
           issueUpdate(id: $id, input: { stateId: $stateId, delegateId: $delegateId }) { success }
         }`,
        {
          id: run.issue_id,
          stateId: this.config.workStateId,
          delegateId: this.config.appActorId,
        },
      );
      const succeeded = (response as { data?: { issueUpdate?: { success?: boolean } } })
        .data?.issueUpdate?.success === true;
      if (!succeeded) {
        await this.store.setState(
          operationId,
          "pending",
          "failed",
          this.now().toISOString(),
          "linear_graphql_failed",
        );
        return this.workStartFailed();
      }
    } catch (error) {
      const readBack = await this.readIssueState(run.issue_id);
      if (
        readBack.id === this.config.workStateId &&
        readBack.delegateId === this.config.appActorId
      ) {
        await this.store.setState(
          operationId,
          "pending",
          "reconciled",
          this.now().toISOString(),
        );
        return this.workStartCompleted();
      }
      if (error instanceof LinearGraphqlError) {
        await this.store.setState(
          operationId,
          "pending",
          "failed",
          this.now().toISOString(),
          error.safeCategory,
        );
        return this.workStartFailed();
      }
      await this.store.setState(
        operationId,
        "pending",
        "manual_reconciliation_required",
        this.now().toISOString(),
        "linear_response_ambiguous",
      );
      return this.workStartFailed();
    }
    const readBack = await this.readIssueState(run.issue_id);
    if (
      readBack.id !== this.config.workStateId ||
      readBack.delegateId !== this.config.appActorId
    ) {
      await this.store.setState(
        operationId,
        "pending",
        "failed",
        this.now().toISOString(),
        "linear_claim_readback_mismatch",
      );
      return this.workStartFailed();
    }
    await this.store.setState(
      operationId,
      "pending",
      "succeeded",
      this.now().toISOString(),
    );
    return this.workStartCompleted();
  }

  async observeHumanGateDelivery(
    operation: HumanGateOperation,
    event: WorkflowInboxRecord,
  ): Promise<HumanGateOperation> {
    const stored = await this.store.find(operation.providerOperationId);
    if (stored === null) throw new Error("Linear transition operation is missing");
    if (stored.state !== "pending") {
      return { providerOperationId: stored.operation_id, state: stateFromOperation(stored) };
    }
    const afterStart = Date.parse(event.provider_time) >= Date.parse(stored.started_at);
    // Linear's provider-originated Issue webhook identifies app-actor mutations
    // with the app user's stable actor ID. The observed payload can still report
    // `actor.type: "user"`, so the configured actor ID is the authoritative
    // discriminator after ingress has verified Linear's HMAC signature.
    const matchingActor = event.actor_id === this.config.appActorId;
    const matchingTransition = event.from_state_id === stored.observed_pre_state &&
      event.to_state_id === stored.sanitized_target;
    if (afterStart && matchingActor && matchingTransition) {
      await this.store.setState(
        stored.operation_id,
        "pending",
        "succeeded",
        this.now().toISOString(),
        null,
        event.delivery_id,
      );
    } else if (afterStart && event.actor_type === "user" && !matchingActor) {
      await this.store.setState(
        stored.operation_id,
        "pending",
        "manual_reconciliation_required",
        this.now().toISOString(),
        "newer_human_intent",
        event.delivery_id,
      );
    }
    const reconciled = await this.store.find(stored.operation_id);
    if (reconciled === null) throw new Error("Linear transition reconciliation disappeared");
    return { providerOperationId: reconciled.operation_id, state: stateFromOperation(reconciled) };
  }

  private async startTransition(
    run: OrchestrationRunRecord,
    _node: HumanGateWorkflowNode,
    action: "enter_human_gate" | "restore_human_gate",
    operationId: string,
    knownPreStateId: string | null,
    latestDeliveryId: string | null,
  ): Promise<HumanGateOperation> {
    const existing = await this.store.find(operationId);
    if (existing !== null) {
      return { providerOperationId: existing.operation_id, state: stateFromOperation(existing) };
    }
    const observed = knownPreStateId === null ? await this.readIssueState(run.issue_id) : {
      id: knownPreStateId,
      updatedAt: this.now().toISOString(),
      delegateId: null,
      assigneeId: null,
    };
    const requestDigest = await sha256Hex(JSON.stringify({
      issueId: run.issue_id,
      targetStateId: this.config.humanGateStateId,
      action,
    }));
    const started = await this.store.begin({
      operationId,
      runId: run.run_id,
      action,
      targetStateId: this.config.humanGateStateId,
      requestDigest,
      observedPreState: observed.id,
      providerUpdatedAt: observed.updatedAt,
      latestDeliveryId,
      now: this.now().toISOString(),
    });
    if (!started.created) {
      return {
        providerOperationId: started.operation.operation_id,
        state: stateFromOperation(started.operation),
      };
    }
    if (observed.id === this.config.humanGateStateId) {
      await this.store.setState(operationId, "pending", "reconciled", this.now().toISOString());
      return { providerOperationId: operationId, state: "confirmed" };
    }
    try {
      const response = await this.graphql(
        `mutation DeosMoveIssue($id: String!, $stateId: String!) {
           issueUpdate(id: $id, input: { stateId: $stateId }) { success }
         }`,
        { id: run.issue_id, stateId: this.config.humanGateStateId },
      );
      const succeeded = (response as { data?: { issueUpdate?: { success?: boolean } } })
        .data?.issueUpdate?.success === true;
      if (!succeeded) {
        await this.store.setState(
          operationId,
          "pending",
          "failed",
          this.now().toISOString(),
          "linear_graphql_failed",
        );
        return { providerOperationId: operationId, state: "manual_reconciliation_required" };
      }
    } catch {
      await this.store.setState(
        operationId,
        "pending",
        "manual_reconciliation_required",
        this.now().toISOString(),
        "linear_response_ambiguous",
      );
      return { providerOperationId: operationId, state: "manual_reconciliation_required" };
    }
    return { providerOperationId: operationId, state: "awaiting_delivery" };
  }

  private async readIssueState(issueId: string): Promise<LinearIssueState> {
    const payload = await this.graphql(
      `query DeosIssueState($id: String!) {
         issue(id: $id) { state { id } delegate { id } assignee { id } updatedAt }
       }`,
      { id: issueId },
    ) as {
      data?: {
        issue?: {
          state?: { id?: string };
          delegate?: { id?: string } | null;
          assignee?: { id?: string } | null;
          updatedAt?: string;
        };
      };
    };
    const id = payload.data?.issue?.state?.id;
    const updatedAt = payload.data?.issue?.updatedAt;
    if (typeof id !== "string" || typeof updatedAt !== "string") {
      throw new Error("Linear issue state response is incomplete");
    }
    return {
      id,
      updatedAt,
      delegateId: payload.data?.issue?.delegate?.id ?? null,
      assigneeId: payload.data?.issue?.assignee?.id ?? null,
    };
  }

  private workStartDigest(issueId: string): Promise<string> {
    return sha256Hex(JSON.stringify({
      issueId,
      targetStateId: this.config.workStateId,
      delegateId: this.config.appActorId,
      action: "delegate_and_start",
    }));
  }

  private workStartCompleted(): ValidatedSystemOutcome {
    return { kind: "system_action", outcome: "completed", providerReceiptsComplete: true };
  }

  private workStartFailed(): ValidatedSystemOutcome {
    return { kind: "system_action", outcome: "failed", providerReceiptsComplete: false };
  }

  private async graphql(query: string, variables: Record<string, unknown>): Promise<unknown> {
    const response = await this.request(this.config.apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
    });
    if (!response.ok) throw new Error("Linear request failed");
    const payload = await response.json() as { errors?: LinearGraphqlFailure[] };
    if (payload.errors?.length) {
      throw new LinearGraphqlError(safeLinearErrorCategory(payload.errors));
    }
    return payload;
  }
}
