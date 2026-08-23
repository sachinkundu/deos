import { correlationIdentity } from "./orchestration-identity.ts";
import {
  D1OrchestrationStore,
  type OrchestrationDispatchStore,
  type OrchestrationRunRecord,
  type WorkflowInboxEvent,
} from "./orchestration-store.ts";
import {
  buildObservation,
  type ErrorType,
  type ObservationInput,
  type ObservationWriter,
  writeObservation,
} from "./telemetry.ts";
import type { LoadedWorkflowDefinition } from "./workflow-definition.ts";
import { type LifecycleWriter, writeLifecycleObservation } from "./lifecycle-telemetry.ts";
import {
  LinearCapabilityAdapter,
  type LinearIssueLabelObservation,
} from "./linear-capability.ts";

export interface QueueBody {
  event_id: string;
  source_delivery_id: string;
  issue_id: string;
  issue_key: string;
  issue_title: string;
  issue_url: string;
  project_id: string;
  transition: string;
  actor_id?: string | null;
  actor_type?: string | null;
  event_kind: string;
  state_id?: string | null;
  previous_state_id?: string | null;
  previous_state_name?: string | null;
  occurred_at: string;
  correlation_id: string;
  payload_digest: string;
}

export interface WorkflowInstanceHandle {
  id: string;
  sendEvent(event: { type: string; payload: unknown }): Promise<void>;
}

export interface WorkflowBinding {
  get(id: string): Promise<WorkflowInstanceHandle>;
  createBatch(
    batch: Array<{ id: string; params: WorkflowStartParameters }>,
  ): Promise<WorkflowInstanceHandle[]>;
}

export interface WorkflowStartParameters {
  runId: string;
  sourceDeliveryId: string;
}

export type QueueConsumerEnv = Omit<Env, "ORCHESTRATION_WORKFLOW"> & {
  ORCHESTRATION_WORKFLOW: WorkflowBinding;
};

type QueueMessageView = Pick<Message<QueueBody>, "id" | "attempts" | "body">;

interface ConsumerDependencies {
  observe: ObservationWriter;
  store: OrchestrationDispatchStore;
  definition: LoadedWorkflowDefinition;
  definitions: Readonly<Record<string, LoadedWorkflowDefinition>>;
  labelResolver: Pick<LinearCapabilityAdapter, "readIssueLabels">;
  now: () => Date;
  lifecycle: LifecycleWriter;
}

const SERVICE_NAME = "deos-queue-consumer-ts";

export class CategorizedWorkflowError extends Error {
  readonly category: ErrorType;

  constructor(category: ErrorType) {
    super(category);
    this.name = "CategorizedWorkflowError";
    this.category = category;
  }
}

const errorCategory = (error: unknown): ErrorType =>
  error instanceof CategorizedWorkflowError ? error.category : "unexpected_failure";

const observationBase = (
  event: QueueBody,
  message: QueueMessageView,
): Omit<ObservationInput, "stage" | "outcome"> => ({
  serviceName: SERVICE_NAME,
  correlationId: event.correlation_id,
  deliveryId: event.source_delivery_id,
  issueId: event.issue_id,
  projectId: event.project_id,
  runId: event.correlation_id,
  messageId: message.id,
  attemptNumber: message.attempts,
});

const emit = (
  observe: ObservationWriter,
  base: Omit<ObservationInput, "stage" | "outcome">,
  input: Pick<ObservationInput, "stage" | "outcome"> & Partial<ObservationInput>,
): void => observe(buildObservation({ ...base, ...input }));

const toInboxEvent = (event: QueueBody, runId: string | null): WorkflowInboxEvent => ({
  deliveryId: event.source_delivery_id,
  runId,
  correlationId: event.correlation_id,
  eventKind: event.event_kind,
  actorId: event.actor_id ?? null,
  actorType: event.actor_type ?? null,
  providerTime: new Date(event.occurred_at).toISOString(),
  fromStateId: event.previous_state_id ?? null,
  fromStateName: event.previous_state_name ?? null,
  toStateId: event.state_id ?? null,
  toStateName: event.transition,
  payloadDigest: event.payload_digest,
});

const locateOrCreateInstance = async (
  binding: WorkflowBinding,
  run: OrchestrationRunRecord,
  sourceDeliveryId: string,
): Promise<WorkflowInstanceHandle> => {
  try {
    return await binding.get(run.workflow_instance_id);
  } catch {
    // A failed lookup is not proof of absence. Creation uses the same stable id,
    // and every ambiguous create response is reconciled with another lookup.
  }
  try {
    const created = await binding.createBatch([{
      id: run.workflow_instance_id,
      params: { runId: run.run_id, sourceDeliveryId },
    }]);
    const handle = created.find((instance) => instance.id === run.workflow_instance_id);
    if (handle !== undefined) return handle;
  } catch {
    // The provider may have committed creation before returning an error.
  }
  try {
    return await binding.get(run.workflow_instance_id);
  } catch {
    throw new CategorizedWorkflowError("unexpected_failure");
  }
};

const establishDispatch = async (
  event: QueueBody,
  run: OrchestrationRunRecord,
  store: OrchestrationDispatchStore,
  binding: WorkflowBinding,
  now: string,
): Promise<void> => {
  const intent = await store.createDispatchIntent(run, event.source_delivery_id, now);
  if (intent.source_delivery_id !== event.source_delivery_id) {
    throw new CategorizedWorkflowError("correlation_mismatch");
  }
  if (intent.state === "established") {
    await locateOrCreateInstance(binding, run, event.source_delivery_id);
    return;
  }
  try {
    await locateOrCreateInstance(binding, run, event.source_delivery_id);
    await store.markDispatchAttempt(run.run_id, "established", now);
  } catch (error) {
    await store.markDispatchAttempt(run.run_id, "failed", now, errorCategory(error));
    throw error;
  }
};

const routeLaterEvent = async (
  event: QueueBody,
  run: OrchestrationRunRecord,
  store: OrchestrationDispatchStore,
  binding: WorkflowBinding,
  now: string,
): Promise<void> => {
  const inserted = await store.insertInboxEvent(toInboxEvent(event, run.run_id), now);
  const inbox = await store.findInboxEvent(event.source_delivery_id);
  if (inbox === null || inbox.run_id !== run.run_id) {
    throw new CategorizedWorkflowError("correlation_mismatch");
  }
  if (!inserted && inbox.state !== "pending") return;
  const instance = await locateOrCreateInstance(binding, run, event.source_delivery_id);
  await instance.sendEvent({ type: "linear-event", payload: { deliveryId: event.source_delivery_id } });
  await store.markInboxState(event.source_delivery_id, "pending", "sent", now);
};

export const processQueueMessage = async (
  message: QueueMessageView,
  env: QueueConsumerEnv,
  dependencies: Partial<ConsumerDependencies> = {},
): Promise<void> => {
  const observe = dependencies.observe ?? writeObservation;
  const store = dependencies.store ?? new D1OrchestrationStore(env.DB);
  const bundled = dependencies.definitions ?? (
    dependencies.definition === undefined
      ? await (await import("./workflow-bundle.ts")).loadBundledWorkflowDefinitionRegistry()
      : Object.freeze({ [dependencies.definition.name]: dependencies.definition })
  );
  const definition = dependencies.definition ?? bundled["openspec-delivery"];
  if (definition === undefined) throw new Error("default workflow definition is unavailable");
  const simpleDefinition = bundled.simple;
  const labelResolver = dependencies.labelResolver ??
    new LinearCapabilityAdapter(env.LINEAR_API_URL, env.LINEAR_APP_ACCESS_TOKEN);
  const now = (dependencies.now ?? (() => new Date()))().toISOString();
  const lifecycle = dependencies.lifecycle ?? writeLifecycleObservation;
  const event = message.body;
  const base = observationBase(event, message);
  emit(observe, base, { stage: "queue.consume", outcome: "started" });
  try {
    if (event.correlation_id !== correlationIdentity(event.project_id, event.issue_id)) {
      throw new CategorizedWorkflowError("correlation_mismatch");
    }
    await store.registerDefinitionAndPolicy({
      definition,
      projectId: env.LINEAR_PROJECT_ID,
      repository: env.TRIAL_REPOSITORY,
      startStateName: env.LINEAR_START_STATE_NAME,
      humanGateStateId: env.LINEAR_HUMAN_APPROVAL_STATE_ID,
      dispatchEnabled: String(env.TRIAL_DISPATCH_ENABLED) === "true",
      now,
    });
    for (const registered of Object.values(bundled)) {
      if (registered.name === definition.name && registered.version === definition.version) continue;
      await store.registerDefinition({ definition: registered, projectId: env.LINEAR_PROJECT_ID, now });
    }
    if (simpleDefinition !== undefined) {
      await store.registerSelector({
        projectId: env.LINEAR_PROJECT_ID,
        repository: env.TRIAL_REPOSITORY,
        labelName: "simple-workflow",
        definition: simpleDefinition,
        now,
      });
    }
    await store.upsertIssueIndex({
      issueId: event.issue_id,
      projectId: event.project_id,
      issueKey: event.issue_key,
      title: event.issue_title,
      linearUrl: event.issue_url,
      sourceDeliveryId: event.source_delivery_id,
      observedAt: event.occurred_at,
    });
    const policy = await store.findPolicy(event.project_id);
    const activeRun = await store.findActiveRun(event.project_id, event.issue_id);
    if (activeRun !== null) {
      const intent = await store.findDispatchIntent(activeRun.run_id);
      if (intent?.source_delivery_id === event.source_delivery_id) {
        await establishDispatch(event, activeRun, store, env.ORCHESTRATION_WORKFLOW, now);
        lifecycle({
          stage: "dispatch.intent",
          outcome: "reconciled",
          correlationId: activeRun.correlation_id,
          runId: activeRun.run_id,
          deliveryId: event.source_delivery_id,
          workflowInstanceId: activeRun.workflow_instance_id,
        });
      } else {
        await routeLaterEvent(event, activeRun, store, env.ORCHESTRATION_WORKFLOW, now);
      }
    } else if (
      policy !== null &&
      policy.dispatch_enabled === 1 &&
      event.transition === policy.start_state_name
    ) {
      let selectedDefinition = definition;
      let selection: {
        kind: "default" | "linear_label";
        value: string;
        deliveryId: string;
        observedAt: string;
        providerDigest: string;
      } = {
        kind: "default",
        value: definition.name,
        deliveryId: event.source_delivery_id,
        observedAt: new Date(event.occurred_at).toISOString(),
        providerDigest: event.payload_digest,
      };
      const selector = simpleDefinition === undefined
        ? null
        : await store.findSelector(event.project_id, env.TRIAL_REPOSITORY, "simple-workflow");
      if (selector?.enabled === 1) {
        let observation: LinearIssueLabelObservation;
        try {
          observation = await labelResolver.readIssueLabels(event.issue_id);
        } catch {
          throw new CategorizedWorkflowError("unexpected_failure");
        }
        if (observation.labels.includes(selector.label_name)) {
          if (
            selector.definition_id !== simpleDefinition?.name ||
            selector.definition_version !== simpleDefinition.version ||
            selector.definition_digest !== simpleDefinition.digest
          ) {
            throw new CategorizedWorkflowError("correlation_mismatch");
          }
          selectedDefinition = simpleDefinition;
          selection = {
            kind: "linear_label",
            value: selector.label_name,
            deliveryId: event.source_delivery_id,
            observedAt: now,
            providerDigest: observation.providerDigest,
          };
        } else {
          selection = {
            kind: "default",
            value: `${selector.label_name}:absent`,
            deliveryId: event.source_delivery_id,
            observedAt: now,
            providerDigest: observation.providerDigest,
          };
        }
      }
      const allocation = await store.allocateRun({
        projectId: event.project_id,
        issueId: event.issue_id,
        definition: selectedDefinition,
        selection,
        now,
      });
      await establishDispatch(event, allocation.run, store, env.ORCHESTRATION_WORKFLOW, now);
      lifecycle({
        stage: "workflow.instance",
        outcome: allocation.created ? "succeeded" : "reconciled",
        correlationId: allocation.run.correlation_id,
        runId: allocation.run.run_id,
        deliveryId: event.source_delivery_id,
        workflowInstanceId: allocation.run.workflow_instance_id,
      });
    } else {
      await store.insertInboxEvent(toInboxEvent(event, null), now);
    }
  } catch (error) {
    emit(observe, base, {
      stage: "queue.consume",
      outcome: "failed",
      errorType: errorCategory(error),
    });
    throw error;
  }
  emit(observe, base, { stage: "queue.consume", outcome: "succeeded" });
};

export const processQueueBatch = async (
  batch: MessageBatch<QueueBody>,
  env: QueueConsumerEnv,
): Promise<void> => {
  try {
    await env.DB.prepare(
      "INSERT INTO queue_consumptions (consumption_id, batch_size, received_at) VALUES (?, ?, ?)",
    ).bind(crypto.randomUUID(), batch.messages.length, new Date().toISOString()).run();
  } catch {
    throw new CategorizedWorkflowError("d1_operation_failed");
  }
  for (const message of batch.messages) await processQueueMessage(message, env);
};
